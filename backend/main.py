import os, time, json, re
import httpx, feedparser
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
import firebase_admin
from firebase_admin import credentials, firestore, auth
from google import genai
from google.genai import types
import secrets

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
key_path = os.path.join(BASE_DIR, "serviceAccountKey.json")

if not firebase_admin._apps:
    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)
db = firestore.client()

gemini = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- user data ----------

def verify_user_token(id_token):
    try:
        return auth.verify_id_token(id_token)["uid"]
    except Exception as e:
        print(f"Error verifying token: {e}")
        return None

def current_user(authorization: str = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")
    uid = verify_user_token(authorization.split("Bearer ")[1])
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token")
    return uid

def user_ref(uid):
    return db.collection("users").document(uid)

class SaveRequest(BaseModel):
    constellation_name: str = Field(min_length=1, max_length=40)

class PhotoRequest(BaseModel):
    constellation_name: str = Field(min_length=1, max_length=40)
    caption: str = Field(default="", max_length=140)
    image: str  # small JPEG data URL, resized in the browser

@app.post("/api/save")
def api_save(req: SaveRequest, uid: str = Depends(current_user)):
    user_ref(uid).set({
        "savedConstellations": firestore.ArrayUnion([req.constellation_name]),
        "savedAt": firestore.SERVER_TIMESTAMP,
    }, merge=True)
    return {"status": "success"}

@app.post("/api/unsave")
def api_unsave(req: SaveRequest, uid: str = Depends(current_user)):
    user_ref(uid).set({
        "savedConstellations": firestore.ArrayRemove([req.constellation_name]),
    }, merge=True)
    return {"status": "success"}

@app.get("/api/profile")
def api_profile(uid: str = Depends(current_user)):
    doc = user_ref(uid).get()
    profile = doc.to_dict() if doc.exists else {}
    photos = []
    query = (user_ref(uid).collection("photos")
             .order_by("createdAt", direction=firestore.Query.DESCENDING).limit(30))
    for d in query.stream():
        p = d.to_dict()
        photos.append({"id": d.id, "constellation": p.get("constellation", ""),
                       "caption": p.get("caption", ""), "image": p.get("image", "")})
    return {"constellations": profile.get("savedConstellations", []), "photos": photos}

@app.post("/api/photos")
def api_add_photo(req: PhotoRequest, uid: str = Depends(current_user)):
    if not req.image.startswith("data:image/jpeg;base64,") or len(req.image) > 400_000:
        raise HTTPException(status_code=400, detail="Image must be a small JPEG")
    _, ref = user_ref(uid).collection("photos").add({
        "constellation": req.constellation_name,
        "caption": req.caption,
        "image": req.image,
        "createdAt": firestore.SERVER_TIMESTAMP,
    })
    return {"id": ref.id}

@app.delete("/api/photos/{photo_id}")
def api_delete_photo(photo_id: str, uid: str = Depends(current_user)):
    user_ref(uid).collection("photos").document(photo_id).delete()
    return {"status": "success"}

@app.post("/api/share")
def api_share(enable: bool = True, uid: str = Depends(current_user)):
    snap = user_ref(uid).get()
    data = snap.to_dict() if snap.exists else {}
    if enable:
        share_id = data.get("shareId") or secrets.token_urlsafe(8)
        user_ref(uid).set({"shareId": share_id}, merge=True)
        return {"shareId": share_id}
    user_ref(uid).set({"shareId": firestore.DELETE_FIELD}, merge=True)
    return {"shareId": None}

@app.get("/api/shared/{share_id}")  # public: no login needed
def api_shared(share_id: str):
    docs = list(db.collection("users").where("shareId", "==", share_id).limit(1).stream())
    if not docs:
        raise HTTPException(status_code=404, detail="Profile not found")
    doc = docs[0]
    data = doc.to_dict()
    try:
        name = auth.get_user(doc.id).display_name or ""
    except Exception:
        name = ""
    photos = []
    query = (doc.reference.collection("photos")
             .order_by("createdAt", direction=firestore.Query.DESCENDING).limit(30))
    for d in query.stream():
        p = d.to_dict()
        photos.append({"constellation": p.get("constellation", ""),
                       "caption": p.get("caption", ""), "image": p.get("image", "")})
    return {"displayName": name,
            "constellations": [c for c in data.get("savedConstellations", []) if c],
            "photos": photos}

# ---------- sky events + Gemini ----------

FEED_URL = "https://www.astronomy.com/tags/sky-this-week/feed/"
MODELS = ["gemini-3.8-flash", "gemini-3.8-flash-lite"]
_cache = {"t": 0, "items": [], "ok": False}

def summarize(items):
    prompt = (
        "For each article, write a 2-sentence beginner-friendly summary "
        "that says what to look for in the sky. Return a JSON list of "
        "strings in the same order.\n\n" + json.dumps([i["text"] for i in items])
    )
    for model in MODELS:
        for attempt in range(2):
            try:
                resp = gemini.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(response_mime_type="application/json"),
                )
                summaries = json.loads(resp.text)
                if isinstance(summaries, list) and len(summaries) == len(items):
                    return [str(s) for s in summaries]
            except Exception as e:
                print(f"Gemini {model} attempt {attempt + 1} failed: {e}")
                if "NOT_FOUND" in str(e):
                    break  # wrong model name, so skip to the next model
                time.sleep(1.5 * (attempt + 1))
    return None

@app.get("/api/sky-events")
def sky_events(refresh: bool = False):
    ttl = 3600 if _cache["ok"] else 60  # retry sooner if the last result was a fallback
    if not refresh and _cache["items"] and time.time() - _cache["t"] < ttl:
        return _cache["items"]

    try:
        r = httpx.get(FEED_URL, timeout=10, follow_redirects=True,
                      headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        entries = feedparser.parse(r.content).entries[:4]
    except Exception as e:
        print("Feed fetch failed:", e)
        if _cache["items"]:
            return _cache["items"]
        raise HTTPException(status_code=502, detail="Could not fetch the feed")

    items = [{
        "title": e.title,
        "link": e.link,
        "published": e.get("published", ""),
        "text": re.sub(r"<[^>]+>", "", e.get("summary", ""))[:1500],
        "summary": "",
    } for e in entries]

    summaries = summarize(items) if items else None
    for i, item in enumerate(items):
        item["summary"] = summaries[i] if summaries else item["text"][:250]

    _cache.update(t=time.time(), items=items, ok=summaries is not None)
    return items