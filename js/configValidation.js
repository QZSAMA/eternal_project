/* Shared CONFIG validation. Works in the browser and under Node's test runner. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ConfigValidation = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const COMMANDS = new Set([
    'scene', 'show', 'hide', 'say', 'menu', 'jump', 'call',
    'wait', 'bgm', 'sfx', 'effect', 'montage', 'proposal',
  ]);
  const POSITIONS = new Set(['left', 'center', 'right']);

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function validateConfig(config) {
    const errors = [];
    const audioPaths = [];
    if (!isRecord(config)) return { ok: false, errors: ['config must be an object'], audioPaths };

    if (!isRecord(config.meta)) errors.push('meta must be an object');
    if (!isRecord(config.images)) errors.push('images must be an object');
    if (!isRecord(config.story) || Object.keys(config.story).length === 0) {
      errors.push('story must contain at least one label');
    }

    const backgrounds = isRecord(config.images?.backgrounds) ? config.images.backgrounds : {};
    const characters = isRecord(config.images?.characters) ? config.images.characters : {};
    const photos = Array.isArray(config.images?.photos) ? config.images.photos : [];
    const audio = isRecord(config.audio) ? config.audio : {};
    const bgm = isRecord(audio.bgm) ? audio.bgm : {};
    Object.values(bgm).forEach((path) => {
      if (typeof path === 'string' && path.trim() && !path.startsWith('synth:')) audioPaths.push(path);
    });

    const labels = new Set(isRecord(config.story) ? Object.keys(config.story) : []);
    Object.entries(isRecord(config.story) ? config.story : {}).forEach(([label, script]) => {
      if (!Array.isArray(script)) {
        errors.push(`story.${label} must be an array`);
        return;
      }
      script.forEach((instruction, index) => {
        const location = `story.${label}[${index}]`;
        if (!isRecord(instruction) || Object.keys(instruction).length !== 1) {
          errors.push(`${location} must contain exactly one command`);
          return;
        }
        const command = Object.keys(instruction)[0];
        const arg = instruction[command];
        if (!COMMANDS.has(command)) {
          errors.push(`${location} unknown command "${command}"`);
          return;
        }
        switch (command) {
          case 'scene':
            if (!isRecord(arg) || typeof arg.bg !== 'string' || !backgrounds[arg.bg]) {
              errors.push(`${location}.scene.bg references an unknown background`);
            }
            break;
          case 'show': {
            const character = isRecord(arg) ? characters[arg.char] : null;
            if (!character) errors.push(`${location}.show.char references an unknown character`);
            else if (typeof arg.expr !== 'string' || !character[arg.expr]) {
              errors.push(`${location}.show.expr references an unknown expression`);
            }
            if (!isRecord(arg) || !POSITIONS.has(arg.pos || 'left')) errors.push(`${location}.show.pos is invalid`);
            break;
          }
          case 'hide':
            if (!isRecord(arg) || (arg.char !== '*' && typeof arg.char !== 'string')) errors.push(`${location}.hide.char is invalid`);
            break;
          case 'say':
            if (!isRecord(arg) || !['hero', 'heroine', 'narration'].includes(arg.who) || typeof arg.text !== 'string') {
              errors.push(`${location}.say requires who and text`);
            }
            break;
          case 'menu':
            if (!isRecord(arg) || !Array.isArray(arg.options) || arg.options.length === 0) {
              errors.push(`${location}.menu.options must be a non-empty array`);
            } else {
              arg.options.forEach((option, optionIndex) => {
                if (!isRecord(option) || typeof option.text !== 'string' || !labels.has(option.next)) {
                  errors.push(`${location}.menu.options[${optionIndex}] references an invalid next label`);
                }
              });
            }
            break;
          case 'jump':
            if (!isRecord(arg) || !labels.has(arg.label)) errors.push(`${location}.jump references missing label "${arg?.label || ''}"`);
            break;
          case 'call':
            if (!isRecord(arg) || typeof arg.minigame !== 'string') errors.push(`${location}.call.minigame is required`);
            break;
          case 'wait':
            if (!isRecord(arg) || !Number.isFinite(arg.ms) || arg.ms < 0) errors.push(`${location}.wait.ms must be a non-negative number`);
            break;
          case 'bgm':
            if (!isRecord(arg) || typeof arg.track !== 'string' || !(arg.track in bgm)) errors.push(`${location}.bgm references an unknown track`);
            break;
          case 'sfx':
            if (!isRecord(arg) || typeof arg.name !== 'string' || !(isRecord(audio.sfx) && arg.name in audio.sfx)) errors.push(`${location}.sfx references an unknown sound`);
            break;
          case 'effect':
            if (!isRecord(arg) || !['flash', 'shake', 'spotlight'].includes(arg.type)) errors.push(`${location}.effect.type is invalid`);
            break;
          case 'montage':
            if (!isRecord(arg) || !Array.isArray(arg.slides)) errors.push(`${location}.montage.slides must be an array`);
            else arg.slides.forEach((slide, slideIndex) => {
              const key = slide?.img;
              const match = typeof key === 'string' && (key.startsWith('assets/') ? photos.includes(key) || key : photos[Number(key.replace('photo', '')) - 1]);
              if (!match) errors.push(`${location}.montage.slides[${slideIndex}] references an unknown photo`);
            });
            break;
          case 'proposal':
            if (arg !== null && !isRecord(arg)) errors.push(`${location}.proposal must be an object`);
            break;
          default:
            break;
        }
      });
    });
    return { ok: errors.length === 0, errors, audioPaths: [...new Set(audioPaths)] };
  }

  return { validateConfig };
}));
