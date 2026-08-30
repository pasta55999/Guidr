/**
 * FALLBACK SNAPSHOT — not the live source of truth.
 *
 * This markdown is a committed, hand-written summary of the UAE Federal Tax Authority
 * guidance on tax invoices (VAT11 — Tax invoices). It is used ONLY when the live
 * Context.dev scrape is unavailable (no `CONTEXT_DEV_API_KEY`, network blocked, or a
 * demo where we must not burn credits). `knowledge:ingestFixture` pushes it through the
 * exact same chunker and the exact same upsert path as `knowledge:ingest`, so retrieval
 * behaviour is byte-identical between the two paths.
 *
 * Source: https://tax.gov.ae/Datafolder/Files/Pdf/2023/Knowledge%20Center%20Page/VAT11%20-%20Tax%20invoices%20En.pdf
 * (Federal Tax Authority, UAE — VAT Guide / Knowledge Centre)
 *
 * Not legal advice; it is training content for a software-skills lesson.
 */

export const FIXTURE_TITLE = "VAT11 — Tax invoices (FTA guidance, fallback snapshot)";

export const FTA_TAX_INVOICE_MARKDOWN = `# Tax invoices — UAE Federal Tax Authority guidance

## What a tax invoice is and when it must be issued

A tax invoice is the document a VAT registered supplier must issue and deliver when it
makes a taxable supply of goods or services. The document must clearly display the words
"Tax Invoice". A tax invoice must be issued within 14 days of the date of supply, and a
registered business must retain a copy of every tax invoice it issues. Where the supply is
made to a recipient who is registered for VAT, the recipient needs a valid tax invoice in
order to recover input tax, so a missing or incomplete field is not a cosmetic problem: it
can block the customer's input tax recovery.

## Supplier details: name, address and TRN

Every full tax invoice must show the name, address and Tax Registration Number (TRN) of
the registered supplier. The TRN is the 15 digit number issued by the Federal Tax
Authority on registration. In an invoicing application the supplier record normally
carries the legal name, the registered address and the TRN together, which is why the
supplier must be selected from the supplier list rather than typed as free text — the
selection is what pulls the TRN onto the invoice.

## Recipient details

Where the recipient of the supply is registered for VAT, the tax invoice must show the
name, address and TRN of that recipient. If the recipient is not registered for VAT, the
recipient's TRN is not shown because there is none, but the supplier still identifies the
customer on the document.

## Invoice number and dates

A full tax invoice must carry a sequential number, or a unique number that identifies the
document and its position in any sequence of invoices. It must also show the date of
issue. Where the date of supply is different from the date of issue, the date of supply
must be stated as well. Invoicing software normally allocates the sequential number when
the invoice is submitted or posted, not while it is still a draft, which is why the number
appears only after the invoice has been submitted.

## Description of the goods or services

The tax invoice must include a description of the goods or services supplied. The
description has to be specific enough to identify what was actually supplied — a bare
"services" or "goods" is not an adequate description. For example "Office stationery
supplies for March 2024" identifies the supply, its nature and its period.

## Amounts: unit price, quantity, tax rate and amount payable in AED

For each line on the tax invoice the supplier must show the unit price, the quantity or
volume supplied, the rate of tax applied and the amount payable, expressed in AED. Any
discount offered must be shown. The invoice must then state the gross amount payable in
AED and the amount of VAT payable in AED. Where an amount has to be converted into AED
from another currency, the invoice must state the exchange rate applied and the source of
that rate — the Central Bank of the UAE published rate is the accepted source. Because
every monetary field ultimately has to be expressed in AED, an invoicing application will
normally hold the amount in AED directly.

## Zero rated, exempt and reverse charge supplies

Where the supply is zero rated or exempt, the invoice must make the treatment of the
supply clear, and a zero rated line shows a tax rate of 0%. Where the recipient rather
than the supplier is required to account for the tax — for example on certain imports of
concerned goods and services subject to the reverse charge mechanism — the tax invoice
must contain a statement that the recipient is required to account for the tax, together
with a reference to the relevant provision of the VAT legislation.

## Simplified tax invoice

A simplified tax invoice may be issued instead of a full tax invoice in two cases: where
the recipient is not registered for VAT, or where the recipient is registered for VAT and
the consideration for the supply, including tax, does not exceed AED 10,000. A simplified
tax invoice is shorter. It must display the words "Tax Invoice" clearly, the name, address
and TRN of the supplier, the date of issue, a description of the goods or services
supplied, and the total consideration together with the amount of tax charged. A
simplified tax invoice does not need to show a separate line by line breakdown of tax, and
it does not carry the recipient's TRN. A retail till receipt from a registered business is
the usual example of a simplified tax invoice.

## Tax credit notes

Where the tax charged on a supply has to be adjusted after the tax invoice was issued —
for example a return, a cancellation or a price change — the supplier issues a tax credit
note. It must clearly display the words "Tax Credit Note", identify the supplier and the
recipient in the same way as a tax invoice, state the value of the change and the tax
charged, and reference the original tax invoice.

## Records and currency

Copies of all tax invoices and tax credit notes issued and received must be kept for the
retention period required by the tax legislation. Amounts stated on the invoice for VAT
purposes are in AED; where the underlying transaction is in a foreign currency the AED
figures, the exchange rate used and the source of that rate all appear on the document.
`;
