import { useEffect, useState } from 'react';

const KEY = 'ob_privacy';

type Prefs = {
  publicProfile: boolean;
  showActivity: boolean;
};

const defaults: Prefs = { publicProfile: true, showActivity: true };

function load(): Prefs {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return defaults;
  }
}

export function Privacy() {
  const [prefs, setPrefs] = useState<Prefs>(defaults);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrefs(load());
  }, []);

  const update = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="mb-8">
        <p className="label-kicker mb-3">You</p>
        <h1 className="font-display text-4xl">Privacy</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Who sees what.</p>
      </div>

      <div className="ob-panel p-6 space-y-5">
        <label className="flex items-start justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-sm font-semibold">Public page</p>
            <p className="text-xs text-[var(--muted)] mt-1">People can find you and your work.</p>
          </div>
          <input
            type="checkbox"
            checked={prefs.publicProfile}
            onChange={(e) => update({ publicProfile: e.target.checked })}
            className="mt-1"
          />
        </label>
        <label className="flex items-start justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-sm font-semibold">Show activity</p>
            <p className="text-xs text-[var(--muted)] mt-1">Stars and reviews can show on your page.</p>
          </div>
          <input
            type="checkbox"
            checked={prefs.showActivity}
            onChange={(e) => update({ showActivity: e.target.checked })}
            className="mt-1"
          />
        </label>
        {saved && <p className="text-xs text-[var(--gold)]">Saved</p>}
      </div>
    </div>
  );
}
