"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  INQUIRY_REFERENCE_BUCKET,
  INQUIRY_REFERENCE_MIME_TYPES,
  MAX_INQUIRY_REFERENCE_BYTES,
  MAX_INQUIRY_REFERENCE_FILES,
  MAX_INQUIRY_REFERENCE_TOTAL_BYTES,
} from "@/lib/inquiries/reference-file-constants";

type FieldErrors = Record<string, string[] | undefined>;

type PrefillValues = {
  name: string;
  email: string;
  company: string;
};

const initialValues = {
  name: "",
  email: "",
  company: "",
  service: "",
  project_brief: "",
  budget_range: "",
  timeline: "",
  website: "",
  design_goal: "",
  brand_message: "",
  target_audience: "",
  desired_outcomes: "",
  references: "",
  time_budget: "",
  design_complexity: "",
  similarity_opt_in: false,
};

const ReferenceUploadResponseSchema = z.object({
  uploads: z.array(
    z.object({
      id: z.string().uuid(),
      path: z.string().min(1),
      token: z.string().min(1),
    }),
  ),
});

function messageFromResponse(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return "We could not submit your inquiry. Please try again.";
}

export function InquiryForm({ prefill }: { prefill?: PrefillValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [uploadedReferenceIds, setUploadedReferenceIds] = useState<string[]>([]);

  useEffect(() => {
    if (!prefill) {
      return;
    }

    setValues((current) => ({
      ...current,
      name: prefill.name || current.name,
      email: prefill.email || current.email,
      company: prefill.company || current.company,
    }));
  }, [prefill]);

  function updateField(
    name: keyof typeof initialValues,
    value: string | number | boolean,
  ) {
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      let referenceIds = uploadedReferenceIds;
      if (referenceFiles.length > 0 && referenceIds.length !== referenceFiles.length) {
        const uploadResponse = await fetch("/api/inquiries/reference-uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            website: values.website,
            files: referenceFiles.map((file) => ({
              name: file.name,
              type: file.type,
              size: file.size,
            })),
          }),
        });
        const uploadPayload: unknown = await uploadResponse.json();
        if (!uploadResponse.ok) {
          throw new Error(messageFromResponse(uploadPayload));
        }

        const parsedUploadPayload = ReferenceUploadResponseSchema.safeParse(uploadPayload);
        if (!parsedUploadPayload.success) {
          throw new Error("We could not prepare your reference images. Please try again.");
        }

        const uploads = parsedUploadPayload.data.uploads;
        if (uploads.length !== referenceFiles.length) {
          throw new Error("We could not prepare your reference images. Please try again.");
        }

        const supabase = createSupabaseBrowserClient();
        for (const [index, file] of referenceFiles.entries()) {
          const upload = uploads[index];
          const { error } = await supabase.storage
            .from(INQUIRY_REFERENCE_BUCKET)
            .uploadToSignedUrl(upload.path, upload.token, file, {
              contentType: file.type,
              upsert: false,
            });
          if (error) {
            throw new Error(`Could not upload ${file.name}. Please try again.`);
          }
        }
        referenceIds = uploads.map((upload) => upload.id);
        setUploadedReferenceIds(referenceIds);
      }

      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          reference_upload_ids: referenceIds,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        if (
          typeof payload === "object" &&
          payload !== null &&
          "fieldErrors" in payload &&
          typeof payload.fieldErrors === "object" &&
          payload.fieldErrors !== null
        ) {
          setFieldErrors(payload.fieldErrors as FieldErrors);
        }
        setFormError(messageFromResponse(payload));
        return;
      }

      sessionStorage.setItem("kiln-inquiry-saved", "true");
      const referenceFilesPending =
        typeof payload === "object" &&
        payload !== null &&
        "referenceFilesPending" in payload &&
        payload.referenceFilesPending === true;
      sessionStorage.setItem(
        "kiln-inquiry-reference-files-pending",
        String(referenceFilesPending),
      );
      router.push("/inquiry/confirmation");
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "We could not reach the server or upload your reference images. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function fieldError(name: keyof typeof initialValues) {
    return fieldErrors[name]?.[0];
  }

  const canAdvance =
    values.name.trim() &&
    values.email.trim() &&
    values.project_brief.trim();

  return (
    <form className="inquiry-form" onSubmit={handleSubmit} noValidate>
      <div className="stepper-row">
        <span className={step === 1 ? "step-pill active" : "step-pill"}>Step 1</span>
        <span className={step === 2 ? "step-pill active" : "step-pill"}>Step 2</span>
      </div>

      {step === 1 && (
        <>
          <div className="form-row">
            <div className="field">
              <label htmlFor="name">Your name *</label>
              <input
                id="name"
                name="name"
                autoComplete="name"
                maxLength={120}
                required
                value={values.name}
                aria-invalid={Boolean(fieldError("name"))}
                aria-describedby={fieldError("name") ? "name-error" : undefined}
                onChange={(event) => updateField("name", event.target.value)}
              />
              {fieldError("name") && <p className="field-error" id="name-error">{fieldError("name")}</p>}
            </div>
            <div className="field">
              <label htmlFor="email">Email address *</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                value={values.email}
                aria-invalid={Boolean(fieldError("email"))}
                aria-describedby={fieldError("email") ? "email-error" : undefined}
                onChange={(event) => updateField("email", event.target.value)}
              />
              {fieldError("email") && <p className="field-error" id="email-error">{fieldError("email")}</p>}
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="company">Company <span className="form-hint">(optional)</span></label>
              <input
                id="company"
                name="company"
                autoComplete="organization"
                maxLength={120}
                value={values.company}
                aria-invalid={Boolean(fieldError("company"))}
                aria-describedby={fieldError("company") ? "company-error" : undefined}
                onChange={(event) => updateField("company", event.target.value)}
              />
              {fieldError("company") && <p className="field-error" id="company-error">{fieldError("company")}</p>}
            </div>
            <div className="field">
              <label htmlFor="service">What do you need?</label>
              <select
                id="service"
                name="service"
                value={values.service}
                onChange={(event) => updateField("service", event.target.value)}
              >
                <option value="">Select a service</option>
                <option value="brand_identity">Brand identity</option>
                <option value="web_design">Web design</option>
                <option value="product_design">Product design</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="project_brief">A little about your project *</label>
            <textarea
              id="project_brief"
              name="project_brief"
              required
              maxLength={5000}
              placeholder="What are you building, and what would you like help with?"
              value={values.project_brief}
              aria-invalid={Boolean(fieldError("project_brief"))}
              aria-describedby={fieldError("project_brief") ? "project-brief-error" : undefined}
              onChange={(event) => updateField("project_brief", event.target.value)}
            />
            {fieldError("project_brief") && (
              <p className="field-error" id="project-brief-error">{fieldError("project_brief")}</p>
            )}
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="budget_range">Budget range</label>
              <select
                id="budget_range"
                name="budget_range"
                value={values.budget_range}
                onChange={(event) => updateField("budget_range", event.target.value)}
              >
                <option value="">Choose a range (optional)</option>
                <option value="under_5k">Under $5k</option>
                <option value="5k_10k">$5k–$10k</option>
                <option value="10k_25k">$10k–$25k</option>
                <option value="25k_50k">$25k–$50k</option>
                <option value="50k_plus">$50k+</option>
                <option value="not_sure">Not sure yet</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="timeline">Ideal timing <span className="form-hint">(optional)</span></label>
              <input
                id="timeline"
                name="timeline"
                maxLength={120}
                placeholder="e.g. Spring 2027"
                value={values.timeline}
                aria-invalid={Boolean(fieldError("timeline"))}
                aria-describedby={fieldError("timeline") ? "timeline-error" : undefined}
                onChange={(event) => updateField("timeline", event.target.value)}
              />
              {fieldError("timeline") && <p className="field-error" id="timeline-error">{fieldError("timeline")}</p>}
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="button-secondary" onClick={() => setStep(2)} disabled={!canAdvance}>
              Continue
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="field">
            <label htmlFor="design_goal">What do you want the design to achieve? <span className="form-hint">(optional)</span></label>
            <textarea id="design_goal" name="design_goal" maxLength={1200} value={values.design_goal ?? ""} onChange={(event) => updateField("design_goal", event.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="brand_message">What should the design convey? <span className="form-hint">(optional)</span></label>
            <textarea id="brand_message" name="brand_message" maxLength={1200} value={values.brand_message ?? ""} onChange={(event) => updateField("brand_message", event.target.value)} />
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="target_audience">Who is it for? <span className="form-hint">(optional)</span></label>
              <input id="target_audience" name="target_audience" maxLength={600} value={values.target_audience ?? ""} onChange={(event) => updateField("target_audience", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="time_budget">Time budget <span className="form-hint">(optional)</span></label>
              <input id="time_budget" name="time_budget" maxLength={120} value={values.time_budget ?? ""} onChange={(event) => updateField("time_budget", event.target.value)} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="desired_outcomes">What would a successful outcome look like? <span className="form-hint">(optional)</span></label>
            <textarea id="desired_outcomes" name="desired_outcomes" maxLength={1200} value={values.desired_outcomes ?? ""} onChange={(event) => updateField("desired_outcomes", event.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="references">Reference links or examples <span className="form-hint">(optional)</span></label>
            <textarea id="references" name="references" maxLength={1200} value={values.references ?? ""} onChange={(event) => updateField("references", event.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="reference-images">
              Upload visual references <span className="form-hint">(optional)</span>
            </label>
            <input
              id="reference-images"
              name="reference-images"
              type="file"
              accept={INQUIRY_REFERENCE_MIME_TYPES.join(",")}
              multiple
              disabled={isSubmitting}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                setUploadedReferenceIds([]);
                if (files.length > MAX_INQUIRY_REFERENCE_FILES) {
                  setFormError(`Choose no more than ${MAX_INQUIRY_REFERENCE_FILES} images.`);
                  setReferenceFiles([]);
                  event.target.value = "";
                  return;
                }
                const invalidFile = files.find(
                  (file) =>
                    !INQUIRY_REFERENCE_MIME_TYPES.some((type) => type === file.type) ||
                    file.size < 1 ||
                    file.size > MAX_INQUIRY_REFERENCE_BYTES,
                );
                if (
                  invalidFile ||
                  files.reduce((total, file) => total + file.size, 0) >
                    MAX_INQUIRY_REFERENCE_TOTAL_BYTES
                ) {
                  setFormError("Use JPEG, PNG, or WebP images, each no larger than 8 MB and no more than 24 MB total.");
                  setReferenceFiles([]);
                  event.target.value = "";
                  return;
                }
                setFormError("");
                setReferenceFiles(files);
              }}
            />
            <p className="form-hint">
              Share up to {MAX_INQUIRY_REFERENCE_FILES} JPEG, PNG, or WebP images,
              up to {MAX_INQUIRY_REFERENCE_BYTES / (1024 * 1024)} MB each. Please
              keep the selection under {MAX_INQUIRY_REFERENCE_TOTAL_BYTES / (1024 * 1024)} MB total
              and avoid sensitive or confidential material.
            </p>
            {referenceFiles.length > 0 && (
              <ul className="form-hint">
                {referenceFiles.map((file, index) => (
                  <li key={`${file.name}-${file.lastModified}-${index}`}>{file.name}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="field">
            <label htmlFor="design_complexity">Design complexity score (0 = unknown, 1 = least, 10 = highest)</label>
            <input id="design_complexity" type="number" min={0} max={10} value={values.design_complexity ?? ""} onChange={(event) => updateField("design_complexity", event.target.value)} />
          </div>

          <div className="field">
            <label className="consent-label">
              <input
                type="checkbox"
                name="similarity_opt_in"
                checked={values.similarity_opt_in}
                disabled={isSubmitting}
                onChange={(event) =>
                  updateField("similarity_opt_in", event.target.checked)
                }
              />{" "}
              Help improve future estimates (optional)
            </label>
            <p className="form-hint">
              If selected, your project brief and design details (goals, brand
              message, audience, and desired outcomes) will be sent to OpenAI to
              create an embedding and stored in Upstash Vector to find similar
              opted-in requests. Your name, email, company, reference links,
              and uploaded images are not sent. Please don&apos;t include
              sensitive or confidential details in text you choose to share.
              Similarity is advisory only and never changes your priority score.
              You can ask the studio to remove this request from the similarity
              index later.
            </p>
          </div>

          <div className="honeypot" aria-hidden="true">
            <label htmlFor="website">Leave this field empty</label>
            <input
              id="website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={values.website}
              onChange={(event) => updateField("website", event.target.value)}
            />
          </div>

          <div className="form-actions">
            <button type="button" className="button-secondary" onClick={() => setStep(1)}>Back</button>
            <button className="button-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Send inquiry"} <span aria-hidden="true">↗</span>
            </button>
          </div>
        </>
      )}

      {formError && <p className="form-error" role="alert">{formError}</p>}
      <p className="form-hint">
        This is a fictional portfolio demo. Please don&apos;t include sensitive
        or confidential information.
      </p>
      {isSubmitting && step === 2 && <span className="form-hint" role="status">Saving your inquiry…</span>}
    </form>
  );
}
