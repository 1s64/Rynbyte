async function logVisit() {
  try {
    const res = await fetch('/api/log-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (res.ok) {
      console.log('Visit logged successfully.');
      document.getElementById('clickme-button').style.display = 'none';
    } else {
      const errorData = await res.json();
      console.error('Server responded with error:', errorData.message);
      document.getElementById('clickme-button').style.display = 'block';
    }
  } catch (err) {
    console.error('Error logging visit:', err);
    document.getElementById('clickme-button').style.display = 'block';
  }
}

window.addEventListener('load', () => {
  logVisit();
});

function clickmeButton() {
  logVisit();
}
