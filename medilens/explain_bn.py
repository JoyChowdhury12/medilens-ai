"""Bangla explanations built from templates.

These are the SAFE FALLBACK and the starting training targets for our fine-tuned model.
Every sentence here must be checked by a medical reviewer before real use.
Never add medicine names or doses.
"""
import re

from .dictionary import get_test
from .range_engine import BORDERLINE, CRITICAL, HIGH, LOW, NORMAL

BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")


def bn_num(x) -> str:
    """7.4 -> '৭.৪'"""
    text = f"{x:.2f}".rstrip("0").rstrip(".") if isinstance(x, float) else str(x)
    return text.translate(BN_DIGITS)


# What a high / low value may mean, in simple Bangla (cautious wording: "হতে পারে").
MEANING = {
    "hemoglobin": {"low": "এটি রক্তস্বল্পতার (অ্যানিমিয়া) লক্ষণ হতে পারে, যার ফলে ক্লান্তি, দুর্বলতা বা মাথা ঘোরা হতে পারে।",
                   "high": "পানিশূন্যতা বা অন্য কোনো কারণে এমন হতে পারে।"},
    "wbc": {"high": "শরীরে সংক্রমণ বা প্রদাহ থাকলে এমন হতে পারে।", "low": "রোগ প্রতিরোধ ক্ষমতা কমে যাওয়ার ইঙ্গিত হতে পারে।"},
    "platelets": {"low": "এতে সহজে রক্তপাত বা কালশিটে পড়ার ঝুঁকি বাড়তে পারে; ডেঙ্গুর মতো সংক্রমণেও এমন হয়।",
                  "high": "প্রদাহ, আয়রনের ঘাটতি বা অন্য কোনো কারণে এমন হতে পারে।"},
    "rbc": {"low": "রক্তস্বল্পতার ইঙ্গিত হতে পারে।", "high": "পানিশূন্যতা বা অন্য কোনো কারণে এমন হতে পারে।"},
    "hematocrit": {"low": "রক্তস্বল্পতার ইঙ্গিত হতে পারে।", "high": "পানিশূন্যতা বা অন্য কোনো কারণে এমন হতে পারে।"},
    "mcv": {"low": "লোহিত কণিকা আকারে ছোট, যা সাধারণত আয়রনের ঘাটতিতে দেখা যায়।",
            "high": "লোহিত কণিকা আকারে বড়, যা ভিটামিন বি১২ বা ফোলেটের ঘাটতিতে দেখা যেতে পারে।"},
    "mch": {"low": "লোহিত কণিকায় হিমোগ্লোবিন কম, যা আয়রনের ঘাটতিতে দেখা যায়।"},
    "neutrophils": {"high": "ব্যাকটেরিয়াজনিত সংক্রমণে সাধারণত এটি বাড়ে।", "low": "রোগ প্রতিরোধ ক্ষমতা কমার ইঙ্গিত হতে পারে।"},
    "lymphocytes": {"high": "ভাইরাস সংক্রমণে সাধারণত এটি বাড়ে।"},
    "eosinophils": {"high": "অ্যালার্জি বা কৃমির সংক্রমণে এটি বাড়তে পারে।"},
    "monocytes": {"high": "দীর্ঘস্থায়ী সংক্রমণ বা প্রদাহে এটি বাড়তে পারে।"},
    "basophils": {"high": "অ্যালার্জি বা প্রদাহে এটি বাড়তে পারে।"},
    "rdw": {"high": "লোহিত কণিকার আকারে বেশি পার্থক্য, যা আয়রন বা ভিটামিনের ঘাটতিতে দেখা যেতে পারে।"},
    "esr": {"high": "শরীরে কোথাও প্রদাহ বা সংক্রমণের ইঙ্গিত হতে পারে।"},
    "fbs": {"high": "রক্তে শর্করা বেশি থাকা ডায়াবেটিস বা প্রি-ডায়াবেটিসের ইঙ্গিত হতে পারে।",
            "low": "শর্করা কম থাকলে মাথা ঘোরা, ঘাম বা দুর্বলতা হতে পারে।"},
    "rbs": {"high": "রক্তে শর্করা বেশি থাকা ডায়াবেটিস বা প্রি-ডায়াবেটিসের ইঙ্গিত হতে পারে।",
            "low": "শর্করা কম থাকলে মাথা ঘোরা, ঘাম বা দুর্বলতা হতে পারে।"},
    "sugar_2h": {"high": "খাবারের পর শর্করা বেশি থাকা ডায়াবেটিস বা প্রি-ডায়াবেটিসের ইঙ্গিত হতে পারে।",
                 "low": "শর্করা কম থাকলে মাথা ঘোরা, ঘাম বা দুর্বলতা হতে পারে।"},
    "hba1c": {"high": "গত প্রায় ৩ মাসের গড় শর্করা বেশি ছিল, যা ডায়াবেটিস বা প্রি-ডায়াবেটিসের ইঙ্গিত হতে পারে।"},
    "cholesterol": {"high": "কোলেস্টেরল বেশি থাকলে দীর্ঘমেয়াদে হৃদরোগের ঝুঁকি বাড়ে।"},
    "ldl": {"high": "খারাপ কোলেস্টেরল বেশি থাকলে রক্তনালিতে চর্বি জমে হৃদরোগের ঝুঁকি বাড়ে।"},
    "hdl": {"low": "ভালো কোলেস্টেরল কম থাকলে হৃদরোগের ঝুঁকি বাড়তে পারে।"},
    "triglycerides": {"high": "এটি খাদ্যাভ্যাস, ওজন বা ডায়াবেটিসের সাথে সম্পর্কিত হতে পারে এবং হৃদরোগের ঝুঁকি বাড়ায়।"},
    "creatinine": {"high": "কিডনি ঠিকমতো কাজ না করার ইঙ্গিত হতে পারে।"},
    "urea": {"high": "কিডনির সমস্যা বা পানিশূন্যতায় এটি বাড়তে পারে।"},
    "uric_acid": {"high": "এটি গেঁটে বাত (গাউট) বা কিডনিতে পাথরের ঝুঁকি বাড়াতে পারে।"},
    "sodium": {"low": "শরীরে লবণ ও পানির ভারসাম্যে সমস্যার ইঙ্গিত হতে পারে।", "high": "শরীরে লবণ ও পানির ভারসাম্যে সমস্যার ইঙ্গিত হতে পারে।"},
    "potassium": {"low": "এটি হৃদস্পন্দন ও পেশির কাজে প্রভাব ফেলতে পারে।", "high": "এটি হৃদস্পন্দন ও পেশির কাজে প্রভাব ফেলতে পারে।"},
    "chloride": {"low": "শরীরে লবণ ও পানির ভারসাম্যে সমস্যার ইঙ্গিত হতে পারে।", "high": "শরীরে লবণ ও পানির ভারসাম্যে সমস্যার ইঙ্গিত হতে পারে।"},
    "calcium": {"low": "এটি হাড় ও পেশির সমস্যার সাথে সম্পর্কিত হতে পারে।", "high": "হরমোন বা অন্য কোনো কারণে এটি বাড়তে পারে।"},
    "alt": {"high": "লিভারে প্রদাহ বা চাপের ইঙ্গিত হতে পারে, যেমন ফ্যাটি লিভার বা হেপাটাইটিস।"},
    "ast": {"high": "লিভারে প্রদাহ বা চাপের ইঙ্গিত হতে পারে।"},
    "alp": {"high": "লিভার বা হাড়ের সমস্যায় এটি বাড়তে পারে।"},
    "bilirubin": {"high": "এটি জন্ডিস বা লিভারের সমস্যার ইঙ্গিত হতে পারে।"},
    "albumin": {"low": "পুষ্টির ঘাটতি বা লিভার ও কিডনির সমস্যায় এটি কমতে পারে।"},
    "total_protein": {"low": "পুষ্টির ঘাটতি বা লিভার ও কিডনির সমস্যায় এটি কমতে পারে।"},
    "tsh": {"high": "থাইরয়েড গ্রন্থি কম কাজ করার (হাইপোথাইরয়েডিজম) ইঙ্গিত হতে পারে।",
            "low": "থাইরয়েড গ্রন্থি বেশি কাজ করার (হাইপারথাইরয়েডিজম) ইঙ্গিত হতে পারে।"},
    "ft4": {"high": "থাইরয়েড হরমোন বেশি থাকার ইঙ্গিত।", "low": "থাইরয়েড হরমোন কম থাকার ইঙ্গিত।"},
    "ft3": {"high": "থাইরয়েড হরমোন বেশি থাকার ইঙ্গিত।", "low": "থাইরয়েড হরমোন কম থাকার ইঙ্গিত।"},
    "vitamin_d": {"low": "ভিটামিন ডি-এর ঘাটতি হাড় দুর্বল করতে পারে।"},
    "vitamin_b12": {"low": "ভিটামিন বি১২-এর ঘাটতি রক্তস্বল্পতা ও স্নায়ুর সমস্যা করতে পারে।"},
    "ferritin": {"low": "শরীরে আয়রনের মজুত কম, যা রক্তস্বল্পতার কারণ হতে পারে।",
                 "high": "প্রদাহ বা শরীরে আয়রন বেশি জমার ইঙ্গিত হতে পারে।"},
    "crp": {"high": "শরীরে প্রদাহ বা সংক্রমণের ইঙ্গিত হতে পারে।"},
}

STATUS_PHRASE = {
    (HIGH, "high"): "স্বাভাবিকের চেয়ে বেশি",
    (LOW, "low"): "স্বাভাবিকের চেয়ে কম",
    (BORDERLINE, "high"): "স্বাভাবিক সীমার একটু বেশি (বর্ডারলাইন)",
    (BORDERLINE, "low"): "স্বাভাবিক সীমার একটু কম (বর্ডারলাইন)",
    (CRITICAL, "high"): "বিপজ্জনক মাত্রায় বেশি",
    (CRITICAL, "low"): "বিপজ্জনক মাত্রায় কম",
}

ACTION = {
    HIGH: "এ বিষয়ে একজন ডাক্তারের পরামর্শ নিন।",
    LOW: "এ বিষয়ে একজন ডাক্তারের পরামর্শ নিন।",
    BORDERLINE: "পরবর্তী চেকআপে ডাক্তারের সাথে বিষয়টি আলোচনা করুন।",
    CRITICAL: "দেরি না করে আজই হাসপাতালে বা ডাক্তারের কাছে যান।",
}

DISCLAIMER_BN = "MediLens শুধু রিপোর্ট বুঝতে সাহায্য করে; এটি রোগ নির্ণয় বা ওষুধের পরামর্শ দেয় না। সবসময় একজন রেজিস্টার্ড ডাক্তারের পরামর্শ নিন।"

# Words that must never appear in generated explanations (medicine / dose advice).
BLOCKED = re.compile(r"\b(mg|tablet|capsule|dose|dosage|insulin|metformin|antibiotic)\b|ট্যাবলেট|ক্যাপসুল|ডোজ|ওষুধ খান|ঔষধ খান|ইনসুলিন",
                     re.IGNORECASE)


def is_safe(text: str) -> bool:
    return not BLOCKED.search(text)


def explain_one(verdict) -> str:
    test = get_test(verdict.code)
    if verdict.status == NORMAL:
        return f"{test['bn']} স্বাভাবিক সীমার মধ্যে আছে ({bn_num(verdict.value)})।"
    phrase = STATUS_PHRASE[(verdict.status, verdict.direction)]
    meaning = MEANING.get(verdict.code, {}).get(verdict.direction, "")
    parts = [f"আপনার {test['bn']} {phrase} ({bn_num(verdict.value)})।", meaning, ACTION[verdict.status]]
    return " ".join(p for p in parts if p)


def summary(verdicts) -> str:
    total = len(verdicts)
    critical = sum(v.status == CRITICAL for v in verdicts)
    abnormal = sum(v.status in (HIGH, LOW) for v in verdicts)
    borderline = sum(v.status == BORDERLINE for v in verdicts)
    normal = total - critical - abnormal - borderline
    if total == 0:
        return "রিপোর্ট থেকে কোনো পরীক্ষার মান পড়া যায়নি। ছবিটি আবার পরিষ্কারভাবে তুলে চেষ্টা করুন।"
    parts = [f"আপনার রিপোর্টে {bn_num(total)}টি পরীক্ষার মধ্যে {bn_num(normal)}টি স্বাভাবিক।"]
    if critical:
        parts.append(f"{bn_num(critical)}টি মান বিপজ্জনক মাত্রায় আছে, তাই আজই ডাক্তারের কাছে যান।")
    if abnormal:
        parts.append(f"{bn_num(abnormal)}টি মান স্বাভাবিক সীমার বাইরে।")
    if borderline:
        parts.append(f"{bn_num(borderline)}টি মান সীমার কাছাকাছি (বর্ডারলাইন)।")
    if not (critical or abnormal or borderline):
        parts.append("সব মান স্বাভাবিক সীমার মধ্যে আছে।")
    return " ".join(parts)
