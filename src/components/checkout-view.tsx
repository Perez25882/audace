"use client";

import Link from "next/link";
import {
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type HTMLInputTypeAttribute,
  type HTMLAttributes,
} from "react";
import { availability, formatGhs, lineKey } from "@/lib/bag";
import { useBag } from "@/lib/bag-store";
import {
  checkoutFields,
  checkoutQuote,
  deliveryOptions,
  validateCheckout,
  type CheckoutValues,
} from "@/lib/checkout";
import { regions, type DeliveryMethod, type Variant } from "@/lib/shop-model";
import { Arrow } from "./icons";
import { reviewDelivery } from "@/app/checkout/actions";
import { checkoutIdentity } from "@/lib/payments/checkout-session";

type Errors = ReturnType<typeof validateCheckout>;

type ContactField = {
  name: "name" | "email" | "phone" | "city" | "address";
  label: string;
  type?: HTMLInputTypeAttribute;
  autoComplete: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
};

const contactFields: ContactField[] = [
  { name: "name", label: "Full name", autoComplete: "name" },
  {
    name: "email",
    label: "Email address",
    type: "email",
    inputMode: "email",
    autoComplete: "email",
  },
  {
    name: "phone",
    label: "Ghanaian phone number",
    type: "tel",
    inputMode: "tel",
    autoComplete: "tel",
  },
];

const addressFields: ContactField[] = [
  {
    name: "city",
    label: "Town or city",
    autoComplete: "shipping address-level2",
  },
  {
    name: "address",
    label: "Delivery address",
    autoComplete: "shipping street-address",
  },
];

function InputField({ field, error }: { field: ContactField; error?: string }) {
  const { name, label, type, inputMode, autoComplete } = field;
  const phone = name === "phone";
  const describedBy =
    [error && `${name}-error`, phone && "phone-hint"]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="checkout-field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type ?? "text"}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={checkoutFields[name]}
        required
        aria-invalid={!!error}
        aria-describedby={describedBy}
      />
      {error && (
        <span id={`${name}-error`} className="shop-alert">
          {error}
        </span>
      )}
      {phone && <span id="phone-hint">Use local format or +233.</span>}
    </div>
  );
}

function formValues(form: HTMLFormElement): CheckoutValues {
  const data = new FormData(form);
  function read(key: keyof CheckoutValues) {
    const value = data.get(key);
    return typeof value === "string" ? value : "";
  }

  return {
    name: read("name"),
    email: read("email"),
    phone: read("phone"),
    region: read("region"),
    city: read("city"),
    address: read("address"),
    directions: read("directions"),
    method: read("method"),
  };
}

export function CheckoutView({
  variants,
  methods,
  serviceUnavailable,
  paymentsAvailable,
}: {
  variants: readonly Variant[];
  methods: readonly DeliveryMethod[];
  serviceUnavailable: boolean;
  paymentsAvailable: boolean;
}) {
  const { items, ready } = useBag();
  const [region, setRegion] = useState("");
  const [methodId, setMethodId] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [serverQuote, setServerQuote] = useState<{
    key: string;
    subtotal: number;
    delivery: number;
    total: number;
  } | null>(null);
  const [reviewError, setReviewError] = useState(false);
  const [pending, startTransition] = useTransition();
  const quoteKey = JSON.stringify([items, region, methodId]);
  const reviewed = serverQuote?.key === quoteKey ? serverQuote : null;
  const formRef = useRef<HTMLFormElement>(null);
  const [paymentError, setPaymentError] = useState("");
  const errorSummary = useRef<HTMLDivElement>(null);
  const quote = checkoutQuote(items, variants, methods, region, methodId);
  const deliveryConfigured = regions.some(
    (name) => deliveryOptions(methods, name).length > 0,
  );
  const orderingPending = variants.some(
    (variant) => availability(variant) === "unconfigured",
  );
  const blocked = !ready || !quote.ready || !deliveryConfigured;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || pending) return;
    setServerQuote(null);
    setReviewError(false);

    const values = formValues(event.currentTarget);
    const currentQuote = checkoutQuote(
      items,
      variants,
      methods,
      values.region,
      values.method,
    );
    const problems = validateCheckout(values, currentQuote.options);
    setErrors(problems);
    if (Object.keys(problems).length) {
      requestAnimationFrame(() => errorSummary.current?.focus());
      return;
    }
    startTransition(async () => {
      try {
        const result = await reviewDelivery(items, values);
        if (result.status === "reviewed") {
          setServerQuote({
            key: quoteKey,
            subtotal: result.subtotal,
            delivery: result.delivery,
            total: result.total,
          });
        } else if (result.status === "invalid") {
          setErrors(result.errors);
          requestAnimationFrame(() => errorSummary.current?.focus());
        } else {
          setReviewError(true);
        }
      } catch {
        setReviewError(true);
      }
    });
  }

  function pay() {
    if (
      !reviewed ||
      !formRef.current ||
      pending ||
      reviewed.subtotal !== quote.subtotal ||
      reviewed.delivery !== quote.method?.feePesewas
    )
      return;
    const contact = formValues(formRef.current);
    const orderedLines = [...items].sort((a, b) =>
      lineKey(a).localeCompare(lineKey(b)),
    );
    setPaymentError("");
    startTransition(async () => {
      try {
        const identity = await checkoutIdentity({
          items: orderedLines,
          contact,
          total: reviewed.total,
        });
        const response = await fetch("/api/payments/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: identity.requestId,
            accessToken: identity.accessToken,
            lines: orderedLines,
            contact,
            expectedTotal: reviewed.total,
          }),
        });
        const result = await response.json();
        if (!response.ok)
          setPaymentError(
            result.error ?? "Payment could not be started. Please try again.",
          );
        else
          window.location.assign(result.authorizationUrl ?? result.statusUrl);
      } catch {
        setPaymentError(
          "The connection or session storage is unavailable. You can safely try this request again.",
        );
      }
    });
  }
  return (
    <section className="frame shop-page" aria-labelledby="checkout-heading">
      <Link className="back-link" href="/bag">
        <Arrow direction="left" /> Back to bag
      </Link>
      <h1 className="shop-heading" id="checkout-heading">
        Guest checkout
      </h1>
      <p className="shop-intro">
        Review your delivery details and order summary.
      </p>
      {(!ready || !quote.ready || !deliveryConfigured) && (
        <div className="shop-notice" role="status">
          {!ready ? (
            <p>Loading your bag…</p>
          ) : (
            <>
              {serviceUnavailable && (
                <p>
                  Store availability is temporarily unavailable. Please try
                  again shortly.
                </p>
              )}
              {!serviceUnavailable && !items.length && (
                <p>
                  {orderingPending
                    ? "Pricing, sizes and stock are awaiting confirmation."
                    : "Add an available garment to your bag to continue."}
                </p>
              )}
              {items.length > 0 && !quote.ready && (
                <p>
                  Some bag items have unconfirmed prices, sizes, or stock.
                  Review your bag to continue.
                </p>
              )}
              {!deliveryConfigured && (
                <p>Delivery methods and fees are awaiting confirmation.</p>
              )}
            </>
          )}
        </div>
      )}
      <div className="shop-layout">
        <form
          ref={formRef}
          className="checkout-form"
          method="post"
          noValidate
          onSubmit={handleSubmit}
          onInput={() => {
            setServerQuote(null);
            setReviewError(false);
          }}
        >
          {!!Object.keys(errors).length && (
            <div
              className="shop-notice"
              role="alert"
              ref={errorSummary}
              tabIndex={-1}
            >
              <p>Check the highlighted details.</p>
              <ul>
                {Object.entries(errors).map(([name, error]) => (
                  <li key={name}>
                    <a href={`#${name}`}>{error}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <fieldset disabled={blocked || pending}>
            <legend>Contact</legend>
            {contactFields.map((field) => (
              <InputField
                key={field.name}
                field={field}
                error={errors[field.name]}
              />
            ))}
          </fieldset>
          <fieldset disabled={blocked || pending}>
            <legend>Delivery</legend>
            <div className="checkout-field">
              <label htmlFor="region">Region</label>
              <select
                id="region"
                name="region"
                autoComplete="shipping address-level1"
                value={region}
                required
                aria-invalid={!!errors.region}
                aria-describedby={errors.region ? "region-error" : undefined}
                onChange={(event) => {
                  setRegion(event.target.value);
                  setMethodId("");
                }}
              >
                <option value="">Select a region</option>
                {regions.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
              {errors.region && (
                <span id="region-error" className="shop-alert">
                  {errors.region}
                </span>
              )}
            </div>
            {addressFields.map((field) => (
              <InputField
                key={field.name}
                field={field}
                error={errors[field.name]}
              />
            ))}
            <div className="checkout-field">
              <label htmlFor="directions">
                Additional directions <span>(optional)</span>
              </label>
              <textarea
                id="directions"
                name="directions"
                rows={3}
                maxLength={checkoutFields.directions}
                aria-invalid={!!errors.directions}
                aria-describedby={
                  errors.directions ? "directions-error" : undefined
                }
              />
              {errors.directions && (
                <span id="directions-error" className="shop-alert">
                  {errors.directions}
                </span>
              )}
            </div>
            <div className="checkout-field">
              <label htmlFor="method">Delivery method</label>
              <select
                id="method"
                name="method"
                value={methodId}
                disabled={!quote.options.length}
                required
                aria-invalid={!!errors.method}
                aria-describedby={
                  errors.method ? "method-error method-hint" : "method-hint"
                }
                onChange={(event) => setMethodId(event.target.value)}
              >
                <option value="">Select a delivery method</option>
                {quote.options.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.label} · {formatGhs(method.feePesewas)}
                  </option>
                ))}
              </select>
              {errors.method && (
                <span id="method-error" className="shop-alert">
                  {errors.method}
                </span>
              )}
              <span id="method-hint">
                {!deliveryConfigured
                  ? "Delivery methods are awaiting confirmation."
                  : !region
                    ? "Choose a region to see delivery methods."
                    : !quote.options.length
                      ? "No delivery method is available in this region."
                      : "The fee appears in your order summary."}
              </span>
            </div>
          </fieldset>
          <button
            className="button button-solid"
            type="submit"
            disabled={blocked || pending || (!!region && !quote.options.length)}
          >
            {pending ? "Checking delivery details…" : "Review delivery details"}{" "}
            <Arrow />
          </button>
          {reviewed && paymentsAvailable && reviewed.total > 0 && (
            <div className="payment-start">
              <button
                className="button button-solid"
                type="button"
                disabled={
                  pending ||
                  reviewed.subtotal !== quote.subtotal ||
                  reviewed.delivery !== quote.method?.feePesewas
                }
                onClick={pay}
              >
                {pending ? "Opening secure checkout…" : "Continue to Paystack"}
              </button>
              <p>
                Choose from the payment options enabled for the store in
                Paystack.
              </p>
            </div>
          )}
          {paymentError && (
            <p className="shop-alert" role="alert">
              {paymentError}
            </p>
          )}
          <p className="purchase-feedback" role="status">
            {reviewError
              ? "We could not confirm your selections. Review your bag or try again shortly."
              : reviewed
                ? paymentsAvailable
                  ? "Your delivery details and total have been checked."
                  : "Delivery details checked. Payments and order placement are currently unavailable."
                : ""}
          </p>
        </form>
        <aside className="shop-summary" aria-labelledby="order-summary">
          <h2 id="order-summary">Order summary</h2>
          {!items.length ? (
            <p>Your bag is empty.</p>
          ) : (
            <ul className="checkout-lines">
              {quote.lines.map(({ item, variant, lineTotal }) => (
                <li key={lineKey(item)}>
                  <div>
                    <strong>
                      {variant
                        ? `${variant.colour} ${variant.name.toLowerCase()}`
                        : "Unavailable item"}
                    </strong>
                    <span>
                      {variant ? `${variant.sleeve} / ` : ""}
                      {item.size} · Qty {item.quantity}
                    </span>
                  </div>
                  <span>
                    {lineTotal === null ? "Unavailable" : formatGhs(lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd>
                {reviewed
                  ? formatGhs(reviewed.subtotal)
                  : quote.subtotal === null
                    ? "Unavailable"
                    : formatGhs(quote.subtotal)}
              </dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>
                {reviewed
                  ? formatGhs(reviewed.delivery)
                  : quote.method
                    ? formatGhs(quote.method.feePesewas)
                    : "Pending"}
              </dd>
            </div>
            <div className="summary-total">
              <dt>Total</dt>
              <dd>
                {reviewed
                  ? formatGhs(reviewed.total)
                  : !quote.canReview || quote.total === null
                    ? "Pending"
                    : formatGhs(quote.total)}
              </dd>
            </div>
          </dl>
          {reviewed &&
            (reviewed.subtotal !== quote.subtotal ||
              reviewed.delivery !== quote.method?.feePesewas) && (
              <p className="shop-alert" role="status">
                The current quote reflects a price or delivery fee change. Open
                the bag for refreshed item prices.
              </p>
            )}
          <Link className="text-action" href="/bag">
            Edit bag
          </Link>
        </aside>
      </div>
    </section>
  );
}
