async function testButton() {
  try {
    const res = await fetch('/api/log-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (res.ok) {
      console.log('Button press logged successfully.');
    } else {
      const errorData = await res.json();
      console.error('Server responded with error:', errorData.message);
    }
  } catch (err) {
    console.error('Error logging button press:', err);
  }
}
