/* Render-mode selection kept pure so fallback behavior is testable without a browser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MinigameMode = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  function chooseMinigameMode({ threeAvailable = false, webglAvailable = false, fallbackAvailable = true } = {}) {
    if (threeAvailable && webglAvailable) return 'three';
    if (fallbackAvailable) return '2d';
    return 'skip';
  }

  function canCreateWebGL(createCanvas) {
    try {
      const canvas = createCanvas();
      return Boolean(canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
    } catch (error) {
      return false;
    }
  }

  function mapPointerToCanvas({ clientX, clientY, rect, canvasWidth, canvasHeight }) {
    const displayWidth = rect && rect.width > 0 ? rect.width : canvasWidth;
    const displayHeight = rect && rect.height > 0 ? rect.height : canvasHeight;
    const x = (clientX - rect.left) * canvasWidth / displayWidth;
    const y = (clientY - rect.top) * canvasHeight / displayHeight;
    return {
      x,
      y,
      nx: (x / canvasWidth) * 2 - 1,
      ny: 1 - (y / canvasHeight) * 2,
    };
  }

  return { chooseMinigameMode, canCreateWebGL, mapPointerToCanvas };
}));
