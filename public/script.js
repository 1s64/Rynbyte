document.addEventListener('DOMContentLoaded', () => {
    // Get all DOM elements
    const loginForm = document.getElementById('loginForm');
    const statusMessage = document.querySelector('.status-message');
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.querySelector('.toggle-password');
    const submitBtn = document.querySelector('.login-btn'); // Changed from '.submit-btn' to match your HTML

    // Debug: Verify all elements exist
    if (!loginForm || !statusMessage || !passwordInput || !togglePasswordBtn || !submitBtn) {
        console.error('Missing critical elements! Check your selectors.');
        return;
    }

    // Form submission handler
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Get input values
        const username = document.getElementById('username').value.trim();
        const password = passwordInput.value.trim();

        // Validate inputs
        if (!username || !password) {
            statusMessage.textContent = '❌ Please fill in all fields';
            statusMessage.className = 'status-message error';
            return;
        }

        // UI Loading State
        submitBtn.disabled = true;
        statusMessage.textContent = 'Authenticating...';
        statusMessage.className = 'status-message processing';

        try {
            // API Request
            const response = await fetch('http://localhost:3000/api/login', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ 
                    username, 
                    password 
                })
            });

            // Handle response
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Login failed');
            }

            // Success case
            statusMessage.textContent = `✅ Welcome, ${data.username}!`;
            statusMessage.className = 'status-message success';
            
            // Store user data
            sessionStorage.setItem('user', JSON.stringify({
                id: data.user_id,
                name: data.username
            }));

            // Redirect after delay
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 1500);

        } catch (error) {
            // Error handling
            console.error('Login error:', error);
            statusMessage.textContent = `❌ Error: ${error.message}`;
            statusMessage.className = 'status-message error';
            passwordInput.value = ''; // Clear password on failure
        } finally {
            submitBtn.disabled = false; // Re-enable button
        }
    });

    // Password visibility toggle
    togglePasswordBtn.addEventListener('click', () => {
        const isVisible = passwordInput.type === 'text';
        passwordInput.type = isVisible ? 'password' : 'text';
        
        // Toggle eye icon
        const icon = togglePasswordBtn.querySelector('i');
        icon.classList.toggle('fa-eye-slash', !isVisible);
        icon.classList.toggle('fa-eye', isVisible);
    });
});
