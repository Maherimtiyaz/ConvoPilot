"use client";

import { useActionState, useState, useTransition } from "react";

import { createContactAction, deleteContactAction, updateContactAction, type FormState } from "./actions";

const field = "block h-10 w-full rounded-md border border-ink-300 bg-white px-3 text-[15px]";
const initial: FormState = { error: null };

export function NewContactForm() {
  const [state, action, pending] = useActionState(createContactAction, initial);
  return (
    <section className="h-fit rounded-[10px] border border-ink-200 bg-white p-5">
      <h2 className="font-semibold">Add a contact</h2>
      <form action={action} className="mt-3 space-y-3">
        {state.error && (
          <p role="alert" className="rounded-md border border-error/30 bg-error-50 px-3 py-2 text-sm text-error">
            {state.error}
          </p>
        )}
        <label className="block space-y-1 text-sm font-medium">
          <span>Name</span>
          <input name="name" required maxLength={200} className={field} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Email</span>
          <input name="email" type="email" maxLength={320} className={field} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Company</span>
          <input name="company" maxLength={200} className={field} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Role</span>
          <input name="roleTitle" maxLength={200} className={field} />
        </label>
        <button type="submit" disabled={pending} className="h-10 w-full rounded-md bg-ink text-sm font-semibold text-white hover:bg-ink-700">
          {pending ? "Saving…" : "Save contact"}
        </button>
      </form>
    </section>
  );
}

export function EditContactForm({ id, name, roleTitle, notes }: { id: string; name: string; roleTitle: string | null; notes: string | null }) {
  const [state, action, pending] = useActionState(updateContactAction.bind(null, id), initial);
  const [confirm, setConfirm] = useState(false);
  const [deleting, start] = useTransition();
  return (
    <section className="rounded-[10px] border border-ink-200 bg-white p-5">
      <h2 className="font-semibold">Details</h2>
      <form action={action} className="mt-3 space-y-3">
        <label className="block space-y-1 text-sm font-medium">
          <span>Name</span>
          <input name="name" required maxLength={200} defaultValue={name} className={field} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Role</span>
          <input name="roleTitle" maxLength={200} defaultValue={roleTitle ?? ""} className={field} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Notes about how you know them</span>
          <textarea name="notes" maxLength={2000} rows={3} defaultValue={notes ?? ""} className="block w-full rounded-md border border-ink-300 px-3 py-2 text-[15px]" />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="h-10 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-700">
            {pending ? "Saving…" : "Save"}
          </button>
          {state.saved && <span role="status" className="text-sm text-success">Saved</span>}
          {state.error && <span role="alert" className="text-sm text-error">{state.error}</span>}
        </div>
      </form>
      <div className="mt-5 border-t border-ink-200 pt-4 text-sm">
        {confirm ? (
          <span className="flex flex-wrap items-center gap-2">
            <span>Delete this contact? Its conversations stay in your workspace.</span>
            <button type="button" disabled={deleting} onClick={() => start(async () => void (await deleteContactAction(id)))} className="h-9 rounded-md bg-error px-3 font-semibold text-white">
              Delete
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="h-9 rounded-md border border-ink-300 px-3">
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="font-medium text-ink-700 hover:text-error">
            Delete contact
          </button>
        )}
      </div>
    </section>
  );
}
