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
  paragraph,
  shell,
  small,
  spacer,
  type EmailBrand,
} from '../notifications/email-components';
import { INK, subjectSafe } from '../notifications/email-theme';
import { BRAND_DEFAULTS } from '../theme/brand-defaults';
import type { RenderedEmail } from '../notifications/templates';

/**
 * Where a new application is announced.
 *
 * The same inbox the contact form writes to, and a constant for the same
 * reason: this is the platform's own address, not a tenant's, and no screen
 * should be able to point it somewhere else.
 */
export const APPLICATION_INBOX = 'mail2vakash@gmail.com';

/**
 * These are sent by the platform, not by a store — an applicant has no store
 * yet — so they carry the house colours rather than a tenant theme.
 */
const EVERYSTORE: EmailBrand = {
  storeName: 'Everystore',
  storeEmail: APPLICATION_INBOX,
  brandColor: BRAND_DEFAULTS.PRIMARY,
  logoUrl: null,
  storefrontUrl: null,
};

const e = escapeHtml;

/** Told to the applicant the moment their application lands. */
export function applicationReceived(request: {
  businessName: string;
  slug: string;
  firstName: string;
}): RenderedEmail {
  const html = shell({
    brand: EVERYSTORE,
    title: 'We have your application',
    preheader: `Your application for ${request.businessName} is with us.`,
    sections: [
      openCard(EVERYSTORE) +
        eyebrow('Application received') +
        spacer(10) +
        h1('We have your application') +
        spacer(14) +
        lede(
          `Thank you, ${e(request.firstName)} — your application for <strong class="e-strong" style="color:${INK.STRONG};">${e(request.businessName)}</strong> is with us.`,
        ) +
        spacer(24) +
        paragraph(
          'A person reads every one of these. If it is approved you will get a second email with your store address and a link to sign in — with the password you chose just now, which we do not send by email and cannot read.',
        ) +
        spacer(12) +
        paragraph('If we need anything else, we will reply to this address.') +
        spacer(28) +
        divider() +
        spacer(20) +
        small(`You asked for the address ${e(request.slug)}. Nothing is reserved until it is approved.`) +
        spacer(32),
    ],
  });

  const text = [
    'We have your application',
    '',
    `Thank you, ${request.firstName} - your application for ${request.businessName} is with us.`,
    '',
    'A person reads every one of these. If it is approved you will get a second',
    'email with your store address and a link to sign in, using the password you',
    'chose just now - we do not send it by email and cannot read it.',
    '',
    `You asked for the address ${request.slug}. Nothing is reserved until it is approved.`,
  ].join('\n');

  return { subject: subjectSafe('We have your Everystore application'), html, text };
}

/** Told to the applicant when it is turned down. */
export function applicationRejected(request: {
  businessName: string;
  firstName: string;
  reason: string;
}): RenderedEmail {
  const html = shell({
    brand: EVERYSTORE,
    title: 'About your application',
    preheader: `We could not take on ${request.businessName} this time.`,
    sections: [
      openCard(EVERYSTORE) +
        eyebrow('Application') +
        spacer(10) +
        h1('About your application') +
        spacer(14) +
        lede(
          `${e(request.firstName)} — we are not able to set up <strong class="e-strong" style="color:${INK.STRONG};">${e(request.businessName)}</strong> at the moment.`,
        ) +
        spacer(24) +
        panel(panelLabel('Why') + panelBody(e(request.reason).replace(/\r?\n/g, '<br />'))) +
        spacer(24) +
        paragraph(
          'If that is something you can put right, apply again — a previous answer does not count against a new application.',
        ) +
        spacer(28) +
        divider() +
        spacer(20) +
        small('Reply to this email if you think we have it wrong.') +
        spacer(32),
    ],
  });

  const text = [
    'About your application',
    '',
    `${request.firstName} - we are not able to set up ${request.businessName} at the moment.`,
    '',
    'Why:',
    request.reason,
    '',
    'If that is something you can put right, apply again - a previous answer does',
    'not count against a new application.',
    '',
    'Reply to this email if you think we have it wrong.',
  ].join('\n');

  return { subject: subjectSafe('About your Everystore application'), html, text };
}

/**
 * Told to the platform, so a queue nobody is watching still gets noticed.
 *
 * Everything a reviewer needs to decide without opening the console, and
 * nothing they could not already see there — no password, hashed or otherwise.
 */
export function newApplication(request: {
  businessName: string;
  slug: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  businessCategory?: string;
  message?: string;
}): RenderedEmail {
  const detail = (label: string, value: string) =>
    panelLabel(label) + panelBody(e(value)) + `<tr><td style="height:14px;"></td></tr>`;

  const html = shell({
    brand: EVERYSTORE,
    title: `Application: ${request.businessName}`,
    preheader: `${request.firstName} ${request.lastName} has applied for ${request.slug}.`,
    sections: [
      openCard(EVERYSTORE) +
        eyebrow('New application') +
        spacer(10) +
        h1(`${e(request.businessName)} has applied`) +
        spacer(14) +
        lede(
          `Approve or refuse it in the console, under <strong class="e-strong" style="color:${INK.STRONG};">Applications</strong>.`,
        ) +
        spacer(24) +
        panel(
          detail('Business', request.businessName) +
            detail('Wants the address', request.slug) +
            (request.businessCategory ? detail('Category', request.businessCategory) : '') +
            detail('Applicant', `${request.firstName} ${request.lastName}`) +
            detail('Email', request.email) +
            (request.phone ? detail('Mobile', request.phone) : '') +
            panelLabel('Message') +
            panelBody(request.message ? e(request.message).replace(/\r?\n/g, '<br />') : '—'),
        ) +
        spacer(28) +
        divider() +
        spacer(20) +
        small('Approving provisions the store and emails them the sign-in link.') +
        spacer(32),
    ],
  });

  const text = [
    `${request.businessName} has applied`,
    '',
    `Business:  ${request.businessName}`,
    `Address:   ${request.slug}`,
    ...(request.businessCategory ? [`Category:  ${request.businessCategory}`] : []),
    `Applicant: ${request.firstName} ${request.lastName}`,
    `Email:     ${request.email}`,
    ...(request.phone ? [`Mobile:    ${request.phone}`] : []),
    '',
    'Message:',
    request.message ?? '—',
    '',
    'Approve or refuse it in the console, under Applications.',
  ].join('\n');

  return {
    subject: subjectSafe(`Everystore application — ${request.businessName}`),
    html,
    text,
  };
}
