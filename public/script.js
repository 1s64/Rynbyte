// Log

async function logVisit() {
  try {
    const res = await fetch('/api/log-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (res.ok) {
      console.log('Visit logged automatically.');
    } else {
      const errorData = await res.json();
      console.error('Server responded with error:', errorData.message);
    }
  } catch (err) {
    console.error('Error logging visit:', err);
  }
}

// Automatically run on page load
window.addEventListener('load', logVisit);