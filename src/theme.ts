/**
 * The page's light and dark themes, JupyterLab's, and the header button that
 * switches between them and the system's (the default).
 *
 * <html data-nbv-theme> holds the theme the page is in, "light" or "dark":
 * index.html sets it before the page first renders, from the same stored
 * choice, and this module keeps it up to date.
 */

import { icon, type IconName } from './icons.ts';
import { h } from './page.ts';

import '@jupyterlab/theme-light-extension/style/variables.css';
// scoped to :root[data-nbv-theme='dark'] (scripts/dark-theme-loader.cjs)
import '@jupyterlab/theme-dark-extension/style/variables.css';
// the icons' colors, from the theme
import '@jupyterlab/ui-components/style/icons.css';

type Choice = 'system' | 'light' | 'dark';
type Theme = Exclude<Choice, 'system'>;

/** The stored choice; none for the system's theme. index.html reads it too. */
const STORAGE_KEY = 'nbv-theme';

const CHOICES: Record<Choice, { name: string; icon: IconName }> = {
  system: { name: 'System', icon: 'circleHalf' },
  light: { name: 'Light', icon: 'sun' },
  dark: { name: 'Dark', icon: 'moon' }
};

/** JupyterLab's names for its themes. */
export const JUPYTERLAB_THEMES: Record<Theme, string> = {
  light: 'JupyterLab Light',
  dark: 'JupyterLab Dark'
};

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const listeners: (() => void)[] = [];

/** The theme the page is in. */
export function pageTheme(): Theme {
  return document.documentElement.dataset.nbvTheme === 'dark'
    ? 'dark'
    : 'light';
}

/** Call `listener` when the page changes themes. */
export function onThemeChange(listener: () => void): void {
  listeners.push(listener);
}

function storedChoice(): Choice {
  try {
    const choice = localStorage.getItem(STORAGE_KEY);
    if (choice === 'light' || choice === 'dark') {
      return choice;
    }
  } catch {
    // storage is blocked: the system's theme
  }
  return 'system';
}

function storeChoice(choice: Choice): void {
  try {
    if (choice === 'system') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, choice);
    }
  } catch {
    // storage is blocked: the choice holds for this page only
  }
}

/**
 * The choice after `choice` on the button. From the system's theme it goes
 * to the other one, so that the first click changes the page, then to the
 * system's, then back to following the system.
 */
function nextChoice(choice: Choice): Choice {
  const [same, other]: Theme[] = systemDark.matches
    ? ['dark', 'light']
    : ['light', 'dark'];
  return choice === 'system' ? other : choice === other ? same : 'system';
}

function setTheme(theme: Theme): void {
  const changed = theme !== pageTheme();
  document.documentElement.dataset.nbvTheme = theme;
  // As JupyterLab sets them, for outputs that look: Vega charts, images that
  // need a light background.
  document.body.dataset.jpThemeLight = String(theme === 'light');
  document.body.dataset.jpThemeName = JUPYTERLAB_THEMES[theme];
  if (changed) {
    for (const listener of listeners) {
      listener();
    }
  }
}

/**
 * Put the page in the stored theme, keep it there (the system's can change,
 * and so can the choice, in another tab), and add the button that switches
 * it to the end of the header.
 */
export function setUpTheme(): void {
  let choice = storedChoice();
  const button = h('button', { type: 'button', class: 'nbv-theme-toggle' });
  const update = () => {
    setTheme(
      choice === 'system' ? (systemDark.matches ? 'dark' : 'light') : choice
    );
    const { name, icon: iconName } = CHOICES[choice];
    const label = `Theme: ${name} (switch to ${CHOICES[nextChoice(choice)].name})`;
    button.replaceChildren(icon(iconName));
    button.title = label;
    button.setAttribute('aria-label', label);
  };
  button.addEventListener('click', () => {
    choice = nextChoice(choice);
    storeChoice(choice);
    update();
  });
  systemDark.addEventListener('change', update);
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY || event.key === null) {
      choice = storedChoice();
      update();
    }
  });
  update();
  document.querySelector('.nbv-header-end')?.append(button);
}
