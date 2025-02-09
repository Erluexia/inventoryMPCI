// JavaScript to validate email domain
function validateEmail() {
    const emailInput = document.getElementById('email');
    const email = emailInput.value;
    const regex = /^[a-zA-Z0-9._%+-]+@mcpi\.edu\.ph$/; // regex to check the email domain
    const errorMessage = document.getElementById('email-error');
    
    if (!regex.test(email)) {
        errorMessage.textContent = 'Please enter a valid email address ending with @mcpi.edu.ph';
        errorMessage.classList.remove('hidden');
        return false; // prevent form submission
    } else {
        errorMessage.classList.add('hidden');
        return true; // allow form submission
    }
}