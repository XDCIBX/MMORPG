// Определение устройства: сенсорный экран (телефон/планшет) или ПК.
const mm = (q) => typeof matchMedia === 'function' && matchMedia(q).matches;

export const IS_TOUCH = (mm('(pointer: coarse)') && mm('(hover: none)')) ||
  (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS

// Телефон — сенсорное устройство с небольшим экраном
export const IS_PHONE = IS_TOUCH && Math.min(screen.width, screen.height) < 600;
