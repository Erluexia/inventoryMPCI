// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDEj4Gf9KB-y21YBl7roSyR0C8VMS9NKqA",
  authDomain: "maryknoll-inventory.firebaseapp.com",
  projectId: "maryknoll-inventory",
  storageBucket: "maryknoll-inventory.firebasestorage.app",
  messagingSenderId: "1031596926539",
  appId: "1:1031596926539:web:831752736f14a7e6778fce",
  measurementId: "G-HR9CZTDHGY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);