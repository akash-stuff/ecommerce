import {
  divider,
  escapeHtml,
  eyebrow,
  h1,
  lede,
  openCard,
  panel,
  panelBody,
  panelLabel,
  shell,
  small,
  spacer,
  type EmailBrand,
} from '../notifications/email-components';
import { INK, subjectSafe } from '../notifications/email-theme';
import { BRAND_DEFAULTS } from '../theme/brand-defaults';
import type { RenderedEmail } from '../notifications/templates';
import type { ContactEnquiryDto } from './dto/contact.dto';

/**
 * The platform writing to itself, so the brand is the platform's own.
 *
 * Every other template in this codebase is sent *as a store* and takes its
 * colours and name from the tenant. This one has no tenant — it is an enquiry
 * from a stranger on the front page — so it uses the house defaults, the same
 * pair the landing page and the console use.
 */
const EVERYSTORE: EmailBrand = {
  storeName: 'Everystore',
  storeEmail: 'mail2vakash@gmail.com',
  brandColor: BRAND_DEFAULTS.PRIMARY,
  logoUrl: null,
  storefrontUrl: null,
};

/**
 * An enquiry from the landing page, as an email.
 *
 * Written to be read on a phone in thirty seconds and replied to: who it is
 * from, how to reach them, and what they said. Every value is escaped —
 * `message` in particular is 2000 characters of whatever a stranger typed, and
 * it is the reason this template exists rather than a string concatenation at
 * the call site.
 *
 * The subject carries the sender's name so a full inbox is sortable, and the
 * plain-text part is a complete copy rather than a summary, because a reply
 * quotes it.
 */
export function platformEnquiry(enquiry: ContactEnquiryDto): RenderedEmail {
  const e = escapeHtml;

  const detail = (label: string, value: string) =>
    panelLabel(label) + panelBody(e(value)) + `<tr><td style="height:14px;"></td></tr>`;

  /**
   * Newlines become `<br>` *after* escaping, so a message containing markup is
   * shown as the text it was typed as and never rendered.
   */
  const messageHtml = e(enquiry.message).replace(/\r?\n/g, '<br />');

  const html = shell({
    brand: EVERYSTORE,
    title: `Enquiry from ${enquiry.name}`,
    preheader: enquiry.message.slice(0, 120),
    sections: [
      openCard(EVERYSTORE) +
        eyebrow('Website enquiry') +
        spacer(10) +
        h1(`${e(enquiry.name)} got in touch`) +
        spacer(14) +
        lede(
          `Reply to this email to answer them directly — it is addressed to <strong class="e-strong" style="color:${INK.STRONG};">${e(enquiry.email)}</strong>.`,
        ) +
        spacer(24) +
        panel(
          detail('Name', enquiry.name) +
            detail('Email', enquiry.email) +
            (enquiry.phone ? detail('Mobile', enquiry.phone) : '') +
            (enquiry.company ? detail('Business', enquiry.company) : '') +
            panelLabel('Message') +
            panelBody(messageHtml),
        ) +
        spacer(28) +
        divider() +
        spacer(20) +
        small('Sent from the contact form on the Everystore landing page.') +
        spacer(32),
    ],
  });

  const text = [
    `${enquiry.name} got in touch`,
    ``,
    `Name:     ${enquiry.name}`,
    `Email:    ${enquiry.email}`,
    ...(enquiry.phone ? [`Mobile:   ${enquiry.phone}`] : []),
    ...(enquiry.company ? [`Business: ${enquiry.company}`] : []),
    ``,
    `Message:`,
    enquiry.message,
    ``,
    `Reply to this email to answer them directly.`,
    `Sent from the contact form on the Everystore landing page.`,
  ].join('\n');

  return {
    subject: subjectSafe(`Everystore enquiry — ${enquiry.name}`),
    html,
    text,
  };
}
