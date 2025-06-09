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

// Hide/Show terms/policy
function toggleSection(id) {
  const el = document.getElementById(id);
  if (!el) return;

  if (el.classList.contains('hidden')) {
    el.classList.remove('hidden');
    el.classList.add('show');
  } else {
    el.classList.add('hidden');
    el.classList.remove('show');
  }
}

// Scare
document.addEventListener("DOMContentLoaded", () => {
  const playBtn = document.getElementById("playBtn");
  const container = document.querySelector(".container");
  let preventUnload = true;

  // Warn user if they try to close/leave
  window.addEventListener("beforeunload", (e) => {
    if (preventUnload) {
      e.preventDefault();
      e.returnValue = "Are you sure you want to exit without saving changes?";
    }
  });

  // Function to allow navigation without warning
  function allowRedirection() {
    preventUnload = false;
  }

  playBtn.addEventListener("click", () => {
    container.innerHTML = `
      <video id="gameVideo" width="100%" height="100%" autoplay playsinline>
        <source src="/public/assets/video1_V1.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    `;

    const video = document.getElementById("gameVideo");

    video.volume = 1.0;

    // Play video, then enter fullscreen
    video.play().catch(err => {
      console.error("Autoplay failed:", err);
    }).then(() => {
      enterFullScreen();
    });

    // Prevent pausing video by user
    video.addEventListener("pause", (e) => {
      e.preventDefault();
      video.play();
    });

    // Disable right-click menu on video
    video.addEventListener('contextmenu', e => e.preventDefault());

    // Listen for fullscreen exit and force it back
    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement) {
        enterFullScreen();
        video.play();
      }
    });
    document.addEventListener("webkitfullscreenchange", () => {
      if (!document.webkitFullscreenElement) {
        enterFullScreen();
        video.play();
      }
    });
    document.addEventListener("mozfullscreenchange", () => {
      if (!document.mozFullScreenElement) {
        enterFullScreen();
        video.play();
      }
    });
    document.addEventListener("MSFullscreenChange", () => {
      if (!document.msFullscreenElement) {
        enterFullScreen();
        video.play();
      }
    });

    // Prevent escape key to exit fullscreen
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.keyCode === 27) {
        e.preventDefault();
        enterFullScreen();
      }
    });

    // After 4 seconds, allow redirection and redirect to homepage
    setTimeout(() => {
      allowRedirection();
      window.location.href = "https://www.rynbyte.xyz/donate";
    }, 4000);

    // Helper: enter fullscreen on video element
    function enterFullScreen() {
      if (video.requestFullscreen) {
        video.requestFullscreen();
      } else if (video.mozRequestFullScreen) {
        video.mozRequestFullScreen();
      } else if (video.webkitRequestFullscreen) {
        video.webkitRequestFullscreen();
      } else if (video.msRequestFullscreen) {
        video.msRequestFullscreen();
      }
    }
  });
});
