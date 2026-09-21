# 🚀 AutoWork Cloud Deployment Guide (Vercel + Render / Railway)

Aapke AutoWork project ko **Vercel (Frontend)** aur **Render / Railway (Backend + DB + Redis)** par live deploy karne ka complete step-by-step guide.

Is guide ko follow karke aap **5 se 10 minute** mein live URL generate kar sakte hain jo aap apne client ko testing ke liye bhej sakte hain.

---

## 🏗️ Architecture Overview

```
                   [ Client / User Browser ]
                               │
               ┌───────────────┴───────────────┐
               │                               │
        (Web App & UI)                 (API & WebSocket)
               ▼                               ▼
       ▲ Vercel (Frontend)           🌐 Render / Railway (Backend)
     Next.js 16 + Turbopack               NestJS API + Workers
               │                               │
               │ (Proxy fallback /api)         ├─► 🐘 PostgreSQL (Database)
               └──────────────────────────────►├─► 🔴 Redis (Queue & Cache)
                                               └─► ☁️ pCloud API (Files & Sharing)
```

---

## 📋 Step 1: Code ko GitHub par Push Karein

1. Apne local repository me changes commit karein:
   ```bash
   git add .
   git commit -m "feat: production ready for Vercel and cloud backend deployment"
   ```
2. Apne GitHub account me ek naya repository create karein (e.g. `autowork-app`).
3. Push karein:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/autowork-app.git
   git branch -M main
   git push -u origin main
   ```

---

## 🌐 Step 2: Backend Deploy Karein (Render ya Railway)

> **Recommendation:** **Render.com** (sabse aasan hai kyunki repository me `render.yaml` pehle se included hai).

### Option A: Render par 1-Click Blueprint (Sabse Simple)
1. **[dashboard.render.com](https://dashboard.render.com)** par login karein.
2. **"New +"** button par click karein -> **"Blueprint"** select karein.
3. Apna GitHub repo (`autowork-app`) connect karein.
4. Render automatically `render.yaml` read karke 3 cheezein create karega:
   - **PostgreSQL Database** (`autowork-postgres`)
   - **Redis Instance** (`autowork-redis`)
   - **Node Web Service** (`autowork-backend`)
5. **Apply** par click karein.
6. Deploy complete hone ke baad aapko Backend URL mil jayega, jaise:
   `https://autowork-backend-xxxx.onrender.com`

---

### Option B: Render par Manual Setup (Agar Blueprint na use karna ho)
1. **PostgreSQL banayein**:
   - New + -> **PostgreSQL** -> Name: `autowork-db` -> **Create Database**
   - **Internal Database URL** copy karein.
2. **Redis banayein**:
   - New + -> **Redis** -> Name: `autowork-redis` -> **Create Redis**
   - **Internal Redis URL** copy karein.
3. **Backend Web Service banayein**:
   - New + -> **Web Service** -> GitHub Repo connect karein.
   - **Root Directory**: `backend`
   - **Build Command**: `npm ci && npx prisma generate --schema=../prisma/schema.prisma && npm run build`
   - **Start Command**: `npx prisma db push --schema=../prisma/schema.prisma && npm run start:prod`
   - **Environment Variables**:
     | Variable | Value |
     |---|---|
     | `NODE_ENV` | `production` |
     | `PORT` | `4000` |
     | `DATABASE_URL` | (Aapka PostgreSQL Connection String) |
     | `REDIS_URL` | (Aapka Redis Connection String) |
     | `JWT_SECRET` | Generate a unique secret of at least 32 characters |
     | `PCLOUD_CREDENTIAL_ENCRYPTION_KEY` | Base64-encoded 32-byte AES-256-GCM key |
     | `PCLOUD_ALLOW_MOCK` | `false` |
     | `PCLOUD_CLIENT_ID` | Your pCloud application client ID |
     | `PCLOUD_CLIENT_SECRET` | Your pCloud application client secret |
     | `FRONTEND_URL` | (Step 3 me milne wala Vercel URL) |

---

## ▲ Step 3: Frontend Deploy Karein (Vercel)

1. **[vercel.com](https://vercel.com)** par login karein.
2. **"Add New..."** -> **"Project"** par click karein.
3. Apna GitHub repo (`autowork-app`) choose karein aur **Import** karein.
4. **Configure Project Settings**:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `Edit` par click karke **`frontend`** select karein.
5. **Environment Variables** add karein:
   | Name | Value | Description |
   |---|---|---|
   | `BACKEND_URL` | `https://autowork-backend-xxxx.onrender.com` | Step 2 me mila Render backend URL |
   | `NEXT_PUBLIC_SOCKET_URL` | `https://autowork-backend-xxxx.onrender.com` | Realtime status ke liye backend URL |
   | `NEXT_PUBLIC_API_URL` | `/api` | Next.js proxies `/api/*` to `BACKEND_URL` |
6. **Deploy** par click karein!
7. 1 se 2 minute me aapko aapka live testing link mil jayega:
   👉 **`https://autowork-frontend-xxxx.vercel.app`**

---

## 🔄 Step 4: Backend me Vercel URL Update Karein

1. Render Dashboard me jayein -> `autowork-backend` service open karein.
2. **Environment** tab me jayein:
   - `FRONTEND_URL` = `https://autowork-frontend-xxxx.vercel.app` (Vercel ka link paste karein).
3. Save changes (Backend automatically reload ho jayega).

---

## 🎯 Step 5: Client / Tester ko Link Bhein aur Test Karein

Ab aap Vercel ka link (`https://autowork-frontend-xxxx.vercel.app`) apne client ko share kar sakte hain.

### Client kya test kar sakta hai:
1. **⚡ 1-Click Instant Demo Login**:
   - Login page par ek bada button hai: **"⚡ 1-Click Instant Demo Login"**.
   - Client bina kisi registration ke seedha 1 click mein full dashboard dekh sakta hai.
2. **Naya Account / Custom Organization Registration**:
   - Client "Register New Custom Workspace" par click karke apna khud ka email aur password daal kar new account create kar sakta hai.
3. **pCloud Account Connect**:
   - `Accounts` page par jakar pCloud connect kar sakta hai (OAuth redirect automatically Vercel par wapas le aayega).
4. **Files & Campaigns**:
   - Documents upload karna, contacts import karna, campaigns schedule karna aur worker logs live dekhna.

---

## 💡 Troubleshooting & FAQ

#### Q: Client ko login ke baad koi 502 ya network error dikhe toh?
> **Answer:** Check karein ki Vercel ke Environment Variables me `BACKEND_URL` sahi daala hai (Render ka backend URL bina trailing slash `/` ke, jaise `https://autowork-backend.onrender.com`).

#### Q: pCloud OAuth ke baad redirect kahan hota hai?
> **Answer:** AutoWork backend intelligent redirect use karta hai. Frontend se jo domain request aayi thi (e.g. `https://autowork.vercel.app`), backend successfully authorize hone ke baad usi domain ke `/accounts?connected=pcloud` par redirect kar deta hai.

#### Q: Redis zaroori hai?
> **Answer:** Render Blueprint me Redis automatically free/starter ban jata hai. Agar Redis kabhi delay hota hai, toh backend crash nahi hota — fail-open rate limiting aur background retry mode active rehta hai.
