"use client";

import { useState } from "react";
import {
  ALLERGEN_LABELS,
  formatINR,
  groupByCategory,
  parseRupees,
  SPICE_LABELS,
  STATION_LABELS,
  type Allergen,
  type Menu,
  type MenuItem,
  type SpiceLevel,
  type Station,
} from "@/domain";
import { useLive } from "@/lib/live";
import { AppHeader } from "./AppHeader";

async function send(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Request failed");
  return json;
}

interface Draft {
  categoryId: string;
  name: string;
  description: string;
  veg: boolean;
  spice: SpiceLevel;
  station: Station;
  prepMinutes: number;
  allergens: Allergen[];
  variants: { id?: string; name: string; price: string }[];
  available: boolean;
  dealLabel: string;
  dealPercentOff: string;
}

const rupees = (paise: number) => (paise / 100).toFixed(paise % 100 === 0 ? 0 : 2);

function toDraft(item: MenuItem): Draft {
  return {
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    veg: item.veg,
    spice: item.spice,
    station: item.station,
    prepMinutes: item.prepMinutes,
    allergens: item.allergens,
    variants: item.variants.map((v) => ({ id: v.id, name: v.name, price: rupees(v.price) })),
    available: item.available,
    dealLabel: item.deal?.label ?? "",
    dealPercentOff: item.deal ? String(item.deal.percentOff) : "",
  };
}

const emptyDraft = (categoryId: string): Draft => ({
  categoryId,
  name: "",
  description: "",
  veg: true,
  spice: 0,
  station: "curry",
  prepMinutes: 10,
  allergens: [],
  variants: [{ name: "Regular", price: "" }],
  available: true,
  dealLabel: "",
  dealPercentOff: "",
});

/** Turn the form into the API body; prices typed in rupees become paise. */
function toBody(d: Draft) {
  const variants = d.variants.map((v) => {
    const price = parseRupees(v.price);
    if (price === undefined) throw new Error(`Price for "${v.name || "size"}" must be in rupees, like 180 or 180.50`);
    return { id: v.id, name: v.name, price };
  });
  return {
    ...d,
    variants,
    dealLabel: d.dealLabel.trim() || undefined,
    dealPercentOff: d.dealPercentOff.trim() ? Number(d.dealPercentOff) : undefined,
  };
}

export function MenuEditor() {
  const live = useLive<{ menu: Menu; now: number }>("/api/owner/menu", 15_000);
  const [editing, setEditing] = useState<{ itemId?: string; draft: Draft }>();
  const [newCategory, setNewCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const menu = live.data?.menu;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMessage(undefined);
    try {
      await fn();
      setMessage({ ok: true, text: ok });
      live.refresh();
      return true;
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Something went wrong" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    const ok = await run(
      () =>
        editing.itemId
          ? send("PUT", `/api/owner/menu/items/${editing.itemId}`, toBody(editing.draft))
          : send("POST", "/api/owner/menu/items", toBody(editing.draft)),
      editing.itemId ? "Dish saved." : "Dish added.",
    );
    if (ok) setEditing(undefined);
  };

  return (
    <>
      <AppHeader title="Menu" subtitle="Changes show on guest menus within seconds" />
      <main id="main" className="console menu-editor">
        {message ? (
          <p className={`notice ${message.ok ? "notice--ok" : "notice--error"}`} role={message.ok ? "status" : "alert"}>
            {message.text}
          </p>
        ) : null}
        {!menu ? (
          <p className="loading" role="status">
            Loading the menu…
          </p>
        ) : (
          <>
            {editing ? (
              <ItemForm
                menu={menu}
                draft={editing.draft}
                isNew={!editing.itemId}
                busy={busy}
                onChange={(draft) => setEditing({ ...editing, draft })}
                onSave={save}
                onCancel={() => setEditing(undefined)}
              />
            ) : null}

            {[...menu.categories]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((category) => {
                const items = groupByCategory(menu).find((g) => g.category.id === category.id)?.items ?? [];
                return (
                  <section key={category.id} className="panel" aria-labelledby={`cat-${category.id}`}>
                    <div className="panel__head">
                      <h2 id={`cat-${category.id}`}>{category.name}</h2>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn--small btn--ghost"
                          disabled={busy}
                          onClick={() => setEditing({ draft: emptyDraft(category.id) })}
                        >
                          Add dish
                        </button>
                        <button
                          type="button"
                          className="btn btn--small btn--ghost"
                          disabled={busy}
                          onClick={() => {
                            const name = window.prompt("New name for this category", category.name);
                            if (name) void run(() => send("PATCH", `/api/owner/menu/categories/${category.id}`, { name }), "Category renamed.");
                          }}
                        >
                          Rename
                        </button>
                        {items.length === 0 ? (
                          <button
                            type="button"
                            className="btn btn--small btn--danger"
                            disabled={busy}
                            onClick={() => run(() => send("DELETE", `/api/owner/menu/categories/${category.id}`), "Category deleted.")}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {items.length === 0 ? <p className="muted">No dishes yet.</p> : null}
                    <ul className="list">
                      {items.map((item) => (
                        <li key={item.id} className="list-row menu-row">
                          <span>
                            <strong>{item.name}</strong>
                            <span className="muted">
                              {" "}
                              · {item.variants.map((v) => `${v.name} ${formatINR(v.price)}`).join(" / ")}
                              {item.deal ? ` · deal ${item.deal.percentOff}% off` : ""}
                            </span>
                          </span>
                          <span className="row-actions">
                            <label className="toggle">
                              <input
                                type="checkbox"
                                checked={item.available}
                                disabled={busy}
                                onChange={(e) =>
                                  run(
                                    () => send("PATCH", `/api/owner/menu/items/${item.id}`, { available: e.target.checked }),
                                    e.target.checked ? `${item.name} is back on the menu.` : `${item.name} marked sold out.`,
                                  )
                                }
                              />
                              Available
                            </label>
                            <button
                              type="button"
                              className="btn btn--small btn--ghost"
                              disabled={busy}
                              onClick={() => setEditing({ itemId: item.id, draft: toDraft(item) })}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn--small btn--danger"
                              disabled={busy}
                              onClick={() => {
                                if (window.confirm(`Delete ${item.name}? Past bills keep their copy.`)) {
                                  void run(() => send("DELETE", `/api/owner/menu/items/${item.id}`), `${item.name} deleted.`);
                                }
                              }}
                            >
                              Delete
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}

            <form
              className="panel inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => send("POST", "/api/owner/menu/categories", { name: newCategory }), "Category added.").then(
                  (ok) => ok && setNewCategory(""),
                );
              }}
            >
              <label className="field">
                <span>New category</span>
                <input value={newCategory} maxLength={40} onChange={(e) => setNewCategory(e.target.value)} placeholder="Chef's specials" />
              </label>
              <button type="submit" className="btn btn--ghost" disabled={busy || newCategory.trim().length < 2}>
                Add category
              </button>
            </form>
          </>
        )}
      </main>
    </>
  );
}

function ItemForm({
  menu,
  draft,
  isNew,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  menu: Menu;
  draft: Draft;
  isNew: boolean;
  busy: boolean;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  return (
    <form
      className="panel item-form"
      aria-labelledby="item-form-h"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <h2 id="item-form-h">{isNew ? "Add a dish" : `Edit ${draft.name}`}</h2>
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input value={draft.name} maxLength={80} required onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="field">
          <span>Category</span>
          <select value={draft.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            {menu.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--wide">
          <span>Description</span>
          <textarea rows={2} maxLength={300} value={draft.description} onChange={(e) => set("description", e.target.value)} />
        </label>
        <label className="field">
          <span>Kitchen station</span>
          <select value={draft.station} onChange={(e) => set("station", e.target.value as Station)}>
            {Object.entries(STATION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Spice</span>
          <select value={draft.spice} onChange={(e) => set("spice", Number(e.target.value) as SpiceLevel)}>
            {Object.entries(SPICE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Prep time (minutes)</span>
          <input
            type="number"
            min={1}
            max={120}
            value={draft.prepMinutes}
            onChange={(e) => set("prepMinutes", Number(e.target.value))}
          />
        </label>
        <label className="toggle">
          <input type="checkbox" checked={draft.veg} onChange={(e) => set("veg", e.target.checked)} />
          Vegetarian
        </label>
        <label className="toggle">
          <input type="checkbox" checked={draft.available} onChange={(e) => set("available", e.target.checked)} />
          Available now
        </label>
      </div>

      <fieldset className="chips">
        <legend>Allergens</legend>
        {(Object.keys(ALLERGEN_LABELS) as Allergen[]).map((a) => (
          <label key={a} className={`chip ${draft.allergens.includes(a) ? "chip--on" : ""}`}>
            <input
              type="checkbox"
              className="sr-only"
              checked={draft.allergens.includes(a)}
              onChange={(e) => set("allergens", e.target.checked ? [...draft.allergens, a] : draft.allergens.filter((x) => x !== a))}
            />
            {ALLERGEN_LABELS[a]}
          </label>
        ))}
      </fieldset>

      <fieldset className="variants-editor">
        <legend>Sizes and prices (₹)</legend>
        {draft.variants.map((v, i) => (
          <div key={i} className="variant-row">
            <label className="field">
              <span>Size {i + 1}</span>
              <input
                value={v.name}
                maxLength={30}
                placeholder="Half"
                onChange={(e) => set("variants", draft.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
            </label>
            <label className="field">
              <span>Price</span>
              <input
                inputMode="decimal"
                value={v.price}
                placeholder="180"
                onChange={(e) => set("variants", draft.variants.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
              />
            </label>
            {draft.variants.length > 1 ? (
              <button
                type="button"
                className="btn btn--small btn--ghost"
                aria-label={`Remove size ${v.name || i + 1}`}
                onClick={() => set("variants", draft.variants.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
        {draft.variants.length < 6 ? (
          <button type="button" className="btn btn--small btn--ghost" onClick={() => set("variants", [...draft.variants, { name: "", price: "" }])}>
            Add size
          </button>
        ) : null}
      </fieldset>

      <div className="form-grid">
        <label className="field">
          <span>Deal label (optional)</span>
          <input value={draft.dealLabel} maxLength={60} placeholder="Happy hour: 20% off" onChange={(e) => set("dealLabel", e.target.value)} />
        </label>
        <label className="field">
          <span>Deal discount %</span>
          <input inputMode="numeric" value={draft.dealPercentOff} placeholder="20" onChange={(e) => set("dealPercentOff", e.target.value)} />
        </label>
      </div>

      <div className="row-actions">
        <button type="submit" className="btn" disabled={busy}>
          {isNew ? "Add dish" : "Save dish"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
