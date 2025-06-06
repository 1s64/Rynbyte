async function declineTerms() {
    console.log("Terms declined.")
}

async function acceptTerms() {
    try {
    const res = await fetch('/api/log-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedTerms: true })
    });
    console.log('Terms accepted.');
    } catch (err) {
    console.error('Error accepting terms:', err);
    }
}
