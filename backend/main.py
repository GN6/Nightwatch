import firebase_admin
from firebase_admin import credentials, firestore, auth

cred = credentials.Certificate("serviceAccountKey.json")

firebase_admin.initialize_app(cred)

db = firestore.client()

def verify_user_token(id_token):
    try:
        decoded_token = auth.verify_id_token(id_token)
        user_id = decoded_token['uid']
        return user_id
    except Exception as e:
        print(f"Error verifying token: {e}")
        return None

def save_favorite_map(user_id, constellation_name):
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
