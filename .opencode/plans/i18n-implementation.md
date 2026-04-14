# i18n Implementation Plan

## Overview

Add multi-language support (English + Spanish) to the React frontend using `react-i18next`. Translation files live co-located with components. Language preference is persisted via the existing user preferences API.

---

## Phase 1: Dependencies and Infrastructure

### 1.1 Install packages

```bash
cd frontend
bun add react-i18next i18next
```

### 1.2 Add `language` to the User model

**File:** `backend/models/User.js`

Add `language` to `profile.preferences`:

```js
preferences: {
  // ...existing fields...
  language: {
    type: String,
    enum: ['en', 'es'],
    default: 'en'
  }
}
```

### 1.3 Update the profile API to accept `language`

**File:** `backend/routes/auth.js`

Update the Zod validation schema (`profileBodySchema`, ~line 88):

```js
const profileBodySchema = z.object({
  display_name: z.string().trim().min(1).max(100).optional(),
  voice_language: z.string().regex(/^$|^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  language: z.enum(["en", "es"]).optional(),  // <-- add this
});
```

Update the `PATCH /api/auth/profile` handler (~line 691) to persist it:

```js
if (language !== undefined) dbUser.profile.preferences.language = language;
```

### 1.4 Create i18n configuration

**New file:** `frontend/src/i18n.js`

```js
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Vite eagerly imports all translation JSONs at build time
const enFiles = import.meta.glob('./components/**/en.json', { eager: true });
const esFiles = import.meta.glob('./components/**/es.json', { eager: true });

// Also load page-level translations
const enPages = import.meta.glob('./pages/**/en.json', { eager: true });
const esPages = import.meta.glob('./pages/**/es.json', { eager: true });

function buildNamespaces(files) {
  const ns = {};
  for (const [path, mod] of Object.entries(files)) {
    // Extract folder name as namespace: "./components/ChatInterface/en.json" -> "ChatInterface"
    const parts = path.split('/');
    const namespace = parts[parts.length - 2];
    ns[namespace] = mod.default;
  }
  return ns;
}

i18n.use(initReactI18next).init({
  resources: {
    en: { ...buildNamespaces(enFiles), ...buildNamespaces(enPages) },
    es: { ...buildNamespaces(esFiles), ...buildNamespaces(esPages) },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
```

### 1.5 Import i18n in the app entry point

**File:** `frontend/src/index.js`

Add at the top, before the app renders:

```js
import './i18n';
```

### 1.6 Apply saved language on login

**File:** `frontend/src/App.js`

Create a `LanguageApplier` component alongside the existing `ThemeApplier` (~line 106):

```js
import i18n from './i18n';

function LanguageApplier() {
  const { user } = useAuth();
  useEffect(() => {
    const savedLang = user?.profile?.preferences?.language;
    if (savedLang) {
      i18n.changeLanguage(savedLang);
    }
  }, [user]);
  return null;
}
```

Render `<LanguageApplier />` alongside `<ThemeApplier />`.

---

## Phase 2: Restructure Flat Components into Folders

Move each flat component into its own folder so translation files can be co-located. For each component, move the `.jsx` and its `.css` (if any) into a folder, renaming the `.jsx` to `index.jsx`.

| Current files | New location |
|---|---|
| `ChatInterface.jsx` + `.css` | `ChatInterface/index.jsx` + `ChatInterface.css` |
| `CommandPalette.jsx` + `.css` | `CommandPalette/index.jsx` + `CommandPalette.css` |
| `CommitPushModal.jsx` | `CommitPushModal/index.jsx` |
| `ErrorBoundary.jsx` | `ErrorBoundary/index.jsx` |
| `MainMenu.jsx` + `.css` | `MainMenu/index.jsx` + `MainMenu.css` |
| `MarkdownRenderer.jsx` + `.css` | `MarkdownRenderer/index.jsx` + `MarkdownRenderer.css` |
| `MentionRenderer.jsx` + `.css` | `MentionRenderer/index.jsx` + `MentionRenderer.css` |
| `MessageInput.jsx` + `.css` | `MessageInput/index.jsx` + `MessageInput.css` |
| `MessageList.jsx` + `.css` | `MessageList/index.jsx` + `MessageList.css` |
| `SessionSidebar.jsx` + `.css` | `SessionSidebar/index.jsx` + `SessionSidebar.css` |
| `UserAvatar.jsx` | `UserAvatar/index.jsx` |
| `WelcomeScreen.jsx` + `.css` | `WelcomeScreen/index.jsx` + `WelcomeScreen.css` |

**Import paths should resolve automatically** -- Vite resolves `./ChatInterface` to `./ChatInterface/index.jsx` by default. Verify with `bun run build` after moving.

**CSS imports inside components** stay the same (e.g. `import './ChatInterface.css'`) since the CSS moves to the same folder.

Also check `MessageOptionsPanel.css` -- move it into whichever component imports it, or delete if unused.

---

## Phase 3: Add Translation Files

For each component folder, create `en.json` and `es.json`. Extract all hardcoded user-facing strings.

### Example: `WelcomeScreen/en.json`

```json
{
  "greeting": "What can I help you with?",
  "loading": "Loading...",
  "suggestedPrompts": "Suggested prompts"
}
```

### Example: `WelcomeScreen/es.json`

```json
{
  "greeting": "En que puedo ayudarte?",
  "loading": "Cargando...",
  "suggestedPrompts": "Indicaciones sugeridas"
}
```

### Components to translate (in priority order)

**High priority -- user-facing UI with significant text:**

1. `WelcomeScreen/` -- greeting, suggested prompts
2. `ChatInterface/` -- chat controls, status messages
3. `MessageInput/` -- placeholder text, voice button labels
4. `MessageList/` -- empty states, timestamps, error messages
5. `SessionSidebar/` -- session titles, search placeholder, empty states
6. `MainMenu/` -- menu items, navigation labels
7. `CommandPalette/` -- search placeholder, command labels
8. `CommitPushModal/` -- form labels, buttons, validation messages
9. `Account/` -- section headings, labels, theme names, form labels, menu items
10. `ErrorBoundary/` -- "Something went wrong", "Try again", "Reload"

**Medium priority -- admin panels:**

11. `Administration/` -- all admin settings pages. Consider a single `Administration/en.json` or split per sub-page if it gets large.
12. `Administration/Resources/` -- CRUD labels, form fields

**Low priority -- minimal/no user-facing text:**

13. `UserAvatar/` -- accessibility alt text only
14. `MarkdownRenderer/` -- no hardcoded strings (renders dynamic content)
15. `MentionRenderer/` -- no hardcoded strings
16. `tools/` -- tool call display labels

### Pages to translate

Also add translation files for pages with hardcoded strings:

17. `pages/LoginPage/` (move to folder first)
18. `pages/StartPage/` (move to folder first)
19. `pages/AccountPage/` -- page title
20. `pages/AdministrationPage/` -- page title
21. `pages/ConversationsPage/` -- page title

---

## Phase 4: Replace Hardcoded Strings in Components

For each component, add the `useTranslation` hook and replace strings.

### Pattern for functional components

```jsx
// Before
export default function WelcomeScreen() {
  return <h1>What can I help you with?</h1>;
}

// After
import { useTranslation } from 'react-i18next';

export default function WelcomeScreen() {
  const { t } = useTranslation('WelcomeScreen');
  return <h1>{t('greeting')}</h1>;
}
```

### Pattern for ErrorBoundary (class component)

Use the `withTranslation` HOC instead of the hook:

```jsx
import { withTranslation } from 'react-i18next';

class ErrorBoundary extends React.Component {
  render() {
    const { t } = this.props;
    return <button>{t('tryAgain')}</button>;
  }
}

export default withTranslation('ErrorBoundary')(ErrorBoundary);
```

### Strings with dynamic values

Use interpolation:

```json
{ "welcome": "Hello, {{name}}!" }
```

```jsx
t('welcome', { name: user.displayName })
```

---

## Phase 5: Language Switcher in Preferences

**File:** `frontend/src/components/Account/Preferences.jsx`

Add a "Language" section alongside the existing Theme and Voice Language sections.

```jsx
import { useTranslation } from 'react-i18next';

// Inside the Preferences component:
const { i18n, t } = useTranslation('Account');

const handleLanguageChange = async (lang) => {
  i18n.changeLanguage(lang);                    // immediate UI update
  await api.updateProfile({ language: lang });   // persist to backend
  await refreshUser();
};
```

Render as a dropdown or card-style selector (matching the existing theme picker pattern):

| Value | Label |
|-------|-------|
| `en` | English |
| `es` | Espanol |

---

## Phase 6: Translate Existing Component Folders

The `Account/`, `Administration/`, and `tools/` folders already exist. Add `en.json` and `es.json` directly:

```
components/Account/en.json
components/Account/es.json
components/Administration/en.json
components/Administration/es.json
components/tools/en.json
components/tools/es.json
```

For `Administration/`, if the single file gets too large, split into per-page namespaces by creating subfolders for each settings page.

---

## Checklist

- [ ] `bun add react-i18next i18next`
- [ ] Add `language` field to User model (`backend/models/User.js`)
- [ ] Update `PATCH /api/auth/profile` to accept `language` (`backend/routes/auth.js`)
- [ ] Create `frontend/src/i18n.js`
- [ ] Import `./i18n` in `frontend/src/index.js`
- [ ] Create `LanguageApplier` in `App.js`
- [ ] Move 12 flat components into folders
- [ ] Move flat pages into folders (if they have translatable strings)
- [ ] Verify no broken imports: `bun run build`
- [ ] Create `en.json` + `es.json` for each component/page folder
- [ ] Replace hardcoded strings with `t()` calls in all components
- [ ] Add language switcher to `Account/Preferences.jsx`
- [ ] Test: switching language updates all visible text immediately
- [ ] Test: language preference persists across page reloads
- [ ] Test: new user gets default language (`en`)
- [ ] Run full build to verify no broken imports or missing translations

---

## Adding More Languages Later

1. Add the new locale code to the `language` enum in both the User model and the Zod schema
2. Add a new `import.meta.glob` line in `i18n.js` for the new locale (e.g. `**/fr.json`)
3. Add the new locale to `buildNamespaces` and `resources` in `i18n.js`
4. Create `fr.json` files in each component folder
5. Add the option to the language switcher in Preferences
