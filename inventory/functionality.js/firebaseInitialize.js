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
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();

// Enable offline persistence
db.enablePersistence()
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
        } else if (err.code == 'unimplemented') {
            console.warn('The current browser does not support offline persistence.');
        }
    });

// Export for use in other files
window.db = db;
window.auth = auth;