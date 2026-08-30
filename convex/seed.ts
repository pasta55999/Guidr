import { mutation } from "./_generated/server";
import { getLessonBySlug, listSteps } from "./lessons";

export const LESSON_SLUG = "create-supplier-invoice";

/** Official FTA guidance on what makes a UAE tax invoice valid. Ingested via Context.dev. */
export const DOC_SOURCE_URL =
  "https://tax.gov.ae/Datafolder/Files/Pdf/2023/Knowledge%20Center%20Page/VAT11%20-%20Tax%20invoices%20En.pdf";

const STEPS = [
  {
    index: 0,
    elementId: "new-invoice-button",
    titleEn: "Open a new invoice",
    titleAr: "افتح فاتورة جديدة",
    instructionEn:
      "Click the New Invoice button at the top of the screen to start a blank invoice.",
    instructionAr:
      "اضغط على زر New Invoice في أعلى الشاشة لبدء فاتورة فارغة.",
    hintEn:
      "It is the blue button in the top right of the toolbar, labelled New Invoice.",
    hintAr: "إنه الزر الأزرق في أعلى يمين شريط الأدوات، المكتوب عليه New Invoice.",
    completion: { kind: "click" as const },
  },
  {
    index: 1,
    elementId: "supplier-dropdown",
    titleEn: "Select the supplier",
    titleAr: "اختر المورّد",
    instructionEn:
      "Open the Supplier dropdown and choose Al Masa Trading LLC. The supplier's name and TRN must appear on a valid tax invoice.",
    instructionAr:
      "افتح قائمة Supplier واختر Al Masa Trading LLC. اسم المورّد ورقم التسجيل الضريبي TRN يجب أن يظهرا في الفاتورة الضريبية الصحيحة.",
    hintEn: "The Supplier field is the first field in the invoice form.",
    hintAr: "حقل Supplier هو أول حقل في نموذج الفاتورة.",
    completion: { kind: "click" as const },
  },
  {
    index: 2,
    elementId: "amount-input",
    titleEn: "Enter the amount",
    titleAr: "أدخل المبلغ",
    instructionEn:
      "Type 1250 into the Amount field. Amounts on a UAE tax invoice must be expressed in AED.",
    instructionAr:
      "اكتب 1250 في حقل Amount. المبالغ في الفاتورة الضريبية الإماراتية يجب أن تكون بالدرهم.",
    hintEn: "The Amount field sits under the supplier, and expects digits only.",
    hintAr: "حقل Amount يوجد تحت المورّد، ويقبل الأرقام فقط.",
    completion: { kind: "input" as const, minLength: 3 },
  },
  {
    index: 3,
    elementId: "description-input",
    titleEn: "Add a description",
    titleAr: "أضف الوصف",
    instructionEn:
      "Write a short description of what was supplied. A tax invoice must describe the goods or services provided.",
    instructionAr:
      "اكتب وصفاً قصيراً للتوريد. الفاتورة الضريبية يجب أن تتضمن وصفاً للسلع أو الخدمات المقدَّمة.",
    hintEn: "For example: Office stationery supplies for March.",
    hintAr: "مثال: قرطاسية مكتبية لشهر مارس.",
    completion: { kind: "input" as const, minLength: 4 },
  },
  {
    index: 4,
    elementId: "submit-invoice-button",
    titleEn: "Submit the invoice",
    titleAr: "أرسل الفاتورة",
    instructionEn:
      "Click Submit Invoice to post it. Once submitted it gets a sequential invoice number, which the FTA requires.",
    instructionAr:
      "اضغط Submit Invoice لتسجيلها. بعد الإرسال تحصل على رقم فاتورة متسلسل، وهذا مطلوب من الهيئة الاتحادية للضرائب.",
    hintEn: "Submit Invoice is the green button at the bottom of the form.",
    hintAr: "زر Submit Invoice هو الزر الأخضر في أسفل النموذج.",
    completion: { kind: "click" as const },
  },
];

/** Idempotent: safe to run repeatedly, always leaves exactly one lesson row. */
export const seedInvoiceLesson = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await getLessonBySlug(ctx.db, LESSON_SLUG);

    const fields = {
      slug: LESSON_SLUG,
      title: "Creating a supplier invoice",
      titleAr: "إنشاء فاتورة مورّد",
      appName: "Nexus Finance",
      docSourceUrl: DOC_SOURCE_URL,
      stepCount: STEPS.length,
    };

    let lessonId;
    if (existing) {
      lessonId = existing._id;
      await ctx.db.patch(lessonId, fields);
      for (const step of await listSteps(ctx.db, lessonId)) {
        await ctx.db.delete(step._id);
      }
    } else {
      lessonId = await ctx.db.insert("lessons", fields);
    }

    for (const step of STEPS) {
      await ctx.db.insert("lessonSteps", { lessonId, ...step });
    }

    return { lessonId, stepCount: STEPS.length };
  },
});
