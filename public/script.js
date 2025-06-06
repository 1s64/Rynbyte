document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('logVisitBtn');

  btn.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/log-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedTerms: true }),
      });

      const data = await res.json();
      if (res.ok) {
        alert('Visit logged successfully!');
      } else {
        alert(`Failed to log visit: ${data.message}`);
      }
    } catch (err) {
      alert('Network error, please try again.');
    }
  });
});
