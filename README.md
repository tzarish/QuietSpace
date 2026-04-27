# QuietSpace 🔮  
**Stop wandering. Start studying.**

QuietSpace is a lightweight web application designed for students to quickly find available study rooms after class. No more walking around checking every door—just open the app and find your spot.

---

## 🚀 The Problem

Students frequently struggle to find quiet study spaces, especially during exam weeks. They waste time wandering hallways and checking with teachers to see if a room is free or supervised.

---

## ✨ The Solution (MVP)

QuietSpace provides a **"live" dashboard** of room availability:

- **Room Numbers:** Clear identification of study locations  
- **Availability Status:** Instant visual cues (Green/Red) for open vs. occupied rooms  
- **Supervisor Info:** See which staff member is currently overseeing the space  
- **Live Updates:** Data reflects current status via staff-side updates  

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript  
- **Data:** JSON (Initial MVP) / Firebase (Real-time updates)  
- **Hosting:** Vercel or Netlify  

---

## 📂 Project Structure
/quiet-space

├── index.html # Student dashboard

├── admin.html # Staff update portal

├── style.css # Mobile-first styling

├── script.js # Data fetching logic

└── rooms.json # Live room data



---

## 🏗️ What We Aren't Building (Yet)

To keep the MVP lean, we are not including:

- The specific number of students in each room  
- The number of computers or outlets available  

---

## ⚙️ Setup

1. Clone the repo  
2. Open `index.html` in any modern browser  
3. To update data, modify `rooms.json`  
   - Or use the admin portal if configured  
