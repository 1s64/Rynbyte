(async () => {
    
  await fetch('/api/log-visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

})();
