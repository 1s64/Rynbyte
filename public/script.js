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

document.addEventListener("DOMContentLoaded", () => {
  const playBtn = document.getElementById("playBtn");
  const roomChoice = document.getElementById("roomChoice");
  const roomCodeInput = document.getElementById("roomCode");
  const joinBtn = document.getElementById("joinBtn");
  const container = document.querySelector(".container");

  // Show room input after Play is clicked
  playBtn.addEventListener("click", () => {
    playBtn.style.display = "none";
    roomChoice.classList.remove("hidden");
  });

  // Restrict input to 6 digits
  roomCodeInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
  });

  // When Join Room is clicked, load and play the video
  joinBtn.addEventListener("click", () => {
    container.innerHTML = `
      <video id="gameVideo" width="100%" height="100%" autoplay playsinline>
        <source src="/public/assets/video1_V1.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    `;

  const video = document.getElementById("gameVideo");

  // Disable controls absolutely
  video.controls = false;

  // Remove controls attribute if somehow present in DOM (just in case)
  video.removeAttribute('controls');

  // Set volume to max
  video.volume = 1.0;

  // Play video
  video.play().catch(err => {
    console.error("Autoplay failed:", err);
  });

  // Request fullscreen
  if (video.requestFullscreen) {
    video.requestFullscreen();
  } else if (video.webkitRequestFullscreen) {
    video.webkitRequestFullscreen();
  } else if (video.msRequestFullscreen) {
    video.msRequestFullscreen();
  }

  // Prevent fullscreen exit as much as possible
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      video.requestFullscreen();
    }
  });

  // Disable right-click menu on video
  video.addEventListener('contextmenu', e => e.preventDefault());

  // Prevent ESC key to exit fullscreen (best effort)
  document.addEventListener('keydown', e => {
    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      video.requestFullscreen();
    }
  });
})})
