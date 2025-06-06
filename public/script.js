document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('logVisitBtn');
  btn.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/log-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedTerms: true }),
      });
      const data = await response.json();
      console.log(data);
      alert(data.message);
    } catch (err) {
      console.error('Request failed', err);
    }
  });
});
