import os
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import firebase_admin
from firebase_admin import credentials, firestore, auth

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
key_path = os.path.join(BASE_DIR, "serviceAccountKey.json")

if not firebase_admin._apps:
    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)
db = firestore.client()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SaveRequest(BaseModel):
    constellation_name: str



def verify_user_token(id_token):
    try:
        decoded_token = auth.verify_id_token(id_token)
        user_id = decoded_token['uid']
        return user_id
    except Exception as e:
        print(f"Error verifying token: {e}")
        return None

def save_favorite_constellation(user_id, constellation_name):
    try:
        db.collection('users').document(user_id).set({
            'savedConstellations': firestore.ArrayUnion([constellation_name]),
            'savedAt': firestore.SERVER_TIMESTAMP
        }, merge=True)
        return True
    except Exception as e:
        print(f"Error saving constellation: {e}")
        return False

def get_user_profile(user_id):
    doc_ref = db.collection('users').document(user_id)
    doc = doc_ref.get()
    if doc.exists:
        return doc.to_dict()
    else:
        return None

@app.post("/api/save")
def api_save_constellation(request: SaveRequest, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")
    
    token = authorization.split("Bearer ")[1]
    user_id = verify_user_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    success = save_favorite_constellation(user_id, request.constellation_name)
    if success:
        return {"status": "success", "message": f"{request.constellation_name} saved!"}
    else:
        raise HTTPException(status_code=500, detail="Database error")