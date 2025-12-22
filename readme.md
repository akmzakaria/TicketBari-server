---

## 📕 Backend `README.md`

```md
# 🎫 TicketGhor – Backend

This repository contains the **backend** of the TicketGhor e-Ticket platform.  
It handles authentication, authorization, ticket management, role management, and payment processing.

---

## 🚀 Features

- RESTful API using Express.js
- JWT-based authentication
- Firebase token verification
- Role-based authorization (Admin, Vendor, User)
- Ticket CRUD operations
- Stripe payment intent API
- Secure MongoDB database integration

---

## 🛠️ Technologies Used

### Backend

- **Node.js**
- **Express.js**
- **MongoDB**
- **Firebase Admin SDK**
- **Stripe**
- **JWT**
- **dotenv**
- **cors**

---

## 📂 API Functionalities

### 🔐 Authentication

- Firebase token verification
- JWT generation and validation

### 🎟️ Tickets

- Add ticket (Vendor)
- Update ticket (Vendor)
- Delete ticket (Vendor)
- Get all tickets
- Search & filter tickets

### 🧑‍💼 User Management (Admin)

- Get all users
- Change user role
- Manage vendors and admins

### 💳 Payment

- Create Stripe payment intent
- Store payment history
- Secure checkout flow

---

## ⚙️ Installation & Setup

```bash
git clone https://github.com/your-username/ticketghor-server.git
cd ticketghor-server
npm install
npm run start
```
