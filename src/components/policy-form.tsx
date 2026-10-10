import {
  CATEGORIES,
  CATEGORY_LABELS,
  MODEL_OPTIONS,
  type Policy,
} from "@/server/review/policy";

export function PolicyForm({
  action,
  policy,
  hidden,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  policy: Policy;
  hidden?: Record<string, string>;
  submitLabel: string;
}) {
  const modelValue = `${policy.modelProvider}:${policy.modelId}`;
  const known = MODEL_OPTIONS.some((option) => `${option.provider}:${option.id}` === modelValue);
  return (
    <form action={action} className="space-y-8">
      {hidden
        ? Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)
        : null}

      <section className="grid gap-6 rounded-lg border border-line bg-paper-2 p-5 md:grid-cols-2">
        <div>
          <h2 className="font-serif text-2xl">Focus</h2>
          <p className="mt-1 text-sm text-muted">Style nits stay off unless your playbook asks for them.</p>
          <div className="mt-4 grid gap-2">
            {CATEGORIES.map((category) => (
              <label key={category} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name={`focus_${category}`}
                  defaultChecked={policy.focus[category]}
                  className="size-4 accent-copper"
                />
                {CATEGORY_LABELS[category]}
              </label>
            ))}
          </div>
        </div>
        <div>
          <h2 className="font-serif text-2xl">When to review</h2>
          <p className="mt-1 text-sm text-muted">Drafts are always skipped. `skip-review` skips a pull request.</p>
          <div className="mt-4 grid gap-2">
            {(
              [
                ["trigger_opened", "Opened", policy.triggers.opened],
                ["trigger_synchronize", "New commits", policy.triggers.synchronize],
                ["trigger_reopened", "Reopened", policy.triggers.reopened],
                ["trigger_readyForReview", "Marked ready for review", policy.triggers.readyForReview],
              ] as const
            ).map(([name, label, checked]) => (
              <label key={name} className="flex items-center gap-3 text-sm">
                <input type="checkbox" name={name} defaultChecked={checked} className="size-4 accent-copper" />
                {label}
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-paper-2 p-5">
        <h2 className="font-serif text-2xl">Playbook</h2>
        <p className="mt-1 text-sm text-muted">
          Instructions for this codebase. Example: we use Result types; do not suggest exceptions.
        </p>
        <textarea
          name="playbook"
          defaultValue={policy.playbook}
          rows={7}
          className="mt-4 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-copper"
        />
      </section>

      <section className="grid gap-6 rounded-lg border border-line bg-paper-2 p-5 md:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Include globs</span>
          <span className="mt-1 block text-muted">Leave empty to review every text file that is not excluded.</span>
          <textarea
            name="includeGlobs"
            defaultValue={policy.includeGlobs.join("\n")}
            rows={6}
            className="mt-3 w-full rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs outline-none focus:border-copper"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Exclude globs</span>
          <span className="mt-1 block text-muted">An include match overrides an exclude match.</span>
          <textarea
            name="excludeGlobs"
            defaultValue={policy.excludeGlobs.join("\n")}
            rows={6}
            className="mt-3 w-full rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs outline-none focus:border-copper"
          />
        </label>
      </section>

      <section className="grid gap-4 rounded-lg border border-line bg-paper-2 p-5 md:grid-cols-2">
        <label className="block text-sm">
          Minimum severity
          <select
            name="minSeverity"
            defaultValue={policy.minSeverity}
            className="mt-2 w-full rounded-md border border-line bg-paper px-3 py-2"
          >
            <option value="blocker">Blocker</option>
            <option value="major">Major</option>
            <option value="minor">Minor</option>
            <option value="nit">Nit</option>
          </select>
        </label>
        <label className="block text-sm">
          Confidence floor
          <input
            name="confidenceFloor"
            type="number"
            min={0}
            max={100}
            defaultValue={policy.confidenceFloor}
            className="mt-2 w-full rounded-md border border-line bg-paper px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Comment budget
          <input
            name="maxComments"
            type="number"
            min={1}
            max={30}
            defaultValue={policy.maxComments}
            className="mt-2 w-full rounded-md border border-line bg-paper px-3 py-2"
          />
        </label>
        <fieldset className="text-sm">
          <legend>When a blocker is found</legend>
          <label className="mt-2 flex items-center gap-2">
            <input type="radio" name="blockingMode" value="comment" defaultChecked={policy.blockingMode === "comment"} />
            Comment only
          </label>
          <label className="mt-2 flex items-center gap-2">
            <input
              type="radio"
              name="blockingMode"
              value="request_changes"
              defaultChecked={policy.blockingMode === "request_changes"}
            />
            Request changes
          </label>
        </fieldset>
        <label className="block text-sm md:col-span-2">
          Model
          <select name="model" defaultValue={modelValue} className="mt-2 w-full rounded-md border border-line bg-paper px-3 py-2">
            {known ? null : <option value={modelValue}>{modelValue}</option>}
            {MODEL_OPTIONS.map((option) => (
              <option key={`${option.provider}:${option.id}`} value={`${option.provider}:${option.id}`}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <button type="submit" className="rounded-md bg-ink px-4 py-2 text-sm text-paper hover:bg-copper">
        {submitLabel}
      </button>
    </form>
  );
}
