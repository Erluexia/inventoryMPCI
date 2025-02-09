import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.14.0/firebase-app.js';
import { 
    getFirestore
} from 'https://www.gstatic.com/firebasejs/9.14.0/firebase-firestore.js';
import { 
    getAuth, 
    onAuthStateChanged, 
    EmailAuthProvider, 
    reauthenticateWithCredential, 
    updatePassword, 
    signOut,
    setPersistence,
    browserLocalPersistence,
    deleteUser,
    signInWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/9.14.0/firebase-auth.js';


// Firebase configuration
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
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
