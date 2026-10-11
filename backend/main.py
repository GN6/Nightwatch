import os, time, json, re
import httpx, feedparser
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import firebase_admin
from firebase_admin import credentials, firestore, auth
from google import genai
from google.genai import types

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
key_path = os.path.join(BASE_DIR, "serviceAccountKey.json")

if not firebase_admin._apps:
    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)
db = firestore.client()

gemini = genai.Client(api_key="AQ.Ab8RN6JJNG6R0Xe97OPJLIGKMciQ9qouL28_oQ8zFlnFMlneDA")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- user data ----------

class SaveRequest(BaseModel):
    constellation_name: str

def verify_user_token(id_token):
    try:
        return auth.verify_id_token(id_token)["uid"]
    except Exception as e:
        print(f"Error verifying token: {e}")
        return None

def save_favorite_constellation(user_id, constellation_name):
    try:
        db.collection("users").document(user_id).set({
            "savedConstellations": firestore.ArrayUnion([constellation_name]),
            "savedAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)
        return True
    except Exception as e:
        print(f"Error saving constellation: {e}")
        return False

def get_user_profile(user_id):
    doc = db.collection("users").document(user_id).get()
    return doc.to_dict() if doc.exists else None

@app.post("/api/save")
def api_save_constellation(request: SaveRequest, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")
    user_id = verify_user_token(authorization.split("Bearer ")[1])
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    if save_favorite_constellation(user_id, request.constellation_name):
        return {"status": "success", "message": f"{request.constellation_name} saved!"}
    raise HTTPException(status_code=500, detail="Database error")

# ---------- sky events + Gemini ----------

FEED_URL = "https://www.astronomy.com/tags/sky-this-week/feed/"
MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"]  # confirm current names in AI Studio
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