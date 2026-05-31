// ===============================
// Firebase Config
// ===============================
const firebaseConfig = {
  apiKey: "AIzaSyBWzXYAxhfqnqKg3nmZ3oVD1TuQUVhVGyI",
  authDomain: "ocr-project-425ca.firebaseapp.com",
  projectId: "ocr-project-425ca",
  storageBucket: "ocr-project-425ca.firebasestorage.app",
  messagingSenderId: "1007566785712",
  appId: "1:1007566785712:web:ed8cecbe936d3e7b7e7f75",
  measurementId: "G-HD3TDH448V"
};

// Initialize Firebase (ONLY HERE for login page)
firebase.initializeApp(firebaseConfig);

document.addEventListener("DOMContentLoaded", () => {

  console.log("LOGIN PAGE READY ✅");

  const btn = document.getElementById("google-login");

  if (!btn) {
    console.error("Login button not found ❌");
    return;
  }

  // Auto redirect if already logged in
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      localStorage.setItem("user", JSON.stringify({
        name: user.displayName,
        email: user.email,
        photo: user.photoURL,
        uid: user.uid
      }));

      window.location.href = "index.html";
    }
  });

  // Login click
  btn.addEventListener("click", () => {

    console.log("LOGIN CLICKED 🚀");

    const provider = new firebase.auth.GoogleAuthProvider();

    firebase.auth().signInWithPopup(provider)
      .then((result) => {

        const user = result.user;

        localStorage.setItem("user", JSON.stringify({
          name: user.displayName,
          email: user.email,
          photo: user.photoURL,
          uid: user.uid
        }));

        window.location.href = "index.html";

      })
      .catch((error) => {
        console.error("LOGIN ERROR:", error);
        alert(error.message);
      });
  });

});