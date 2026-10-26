# Smart Medical Record System – Backend

The backend for the Smart Medical Record System (SMRS) handles secure PDF uploads, user authentication integration, metadata management, and communication with Firebase Firestore.

This service is deployed on **Render** and exposes REST APIs used by the frontend.

---

## 🚀 Features
- PDF upload & validation  
- Secure file storage  
- Firestore database integration  
- Firebase Authentication support  
- REST API endpoints  
- Environment variable support  
- CORS enabled for frontend communication  
- Production-ready deployment on Render

---

## 🧩 Tech Stack
- **Node.js**
- **Express.js**
- **Firebase Firestore**
- **Multer** (file uploads)
- **Render** (deployment)
- **dotenv**

---

## 📂 Project Structure

```
medical-backend/
├── assets/                     # Uploaded PDF files       # Handles /upload API logic
├── index.js                    # Main Express server
|                               # Handles /upload API logic
|                               # PDF processing, saving, metadata
|                               # Firebase Firestore config
├── package.json
├── package-lock.json
├── .env                        # Environment variables
└── .gitignore
```

---

## 🔧 Setup Instructions

### 1. Clone the repo
```bash
git clone https://github.com/IIKirito-kunII/medical-backend
cd medical-backend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Add your `.env`
```
PORT=8000
FIREBASE_TYPE=service_account
# your firestore credentials...
```

### 4. Start development server
```bash
node index.js
```

---

## 🌐 Deployment (Render)
The backend is deployed at:

🔗 **https://medical-backend-11qg.onrender.com**

---

## 📜 License
This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.
