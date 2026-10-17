package com.leadfinder.search;

import java.text.Normalizer;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * The search workflow knows business types by English words. A person searching in French ("cabinets dentaires",
 * "salons de coiffure") is understood by mapping common French and Arabic words to the English type first.
 * What the person typed is kept on the search; only the text sent to the workflow changes.
 */
public final class NicheNormalizer {

    private static final Map<String, String> RULES = new LinkedHashMap<>();

    static {
        // order matters: the first matching rule wins
        RULES.put("dentaire|dentiste|dentistes|dentaires|اسنان|أسنان", "dental clinics");
        RULES.put("medecin|clinique|docteur|medical|medicale|cabinet medical|عيادة|طبيب", "doctors and clinics");
        RULES.put("pharmacie|pharmacies|صيدلية", "pharmacies");
        RULES.put("restaurant|resto|مطعم", "restaurants");
        RULES.put("\\bcafe\\b|\\bcafes\\b|salon de the|مقهى", "cafes");
        RULES.put("hotel|hotels|maison d'hote|maisons d'hote|auberge|فندق|نزل", "hotels");
        RULES.put("salle de sport|salles de sport|fitness|musculation|gym\\b|قاعة رياضة", "gyms");
        RULES.put("coiffure|coiffeur|coiffeurs|barbier|حلاق|تجميل رجال", "hair salons");
        RULES.put("institut de beaute|esthetique|beaute|manucure|spa\\b|تجميل", "beauty salons");
        RULES.put("avocat|avocats|cabinet d'avocat|juridique|محام", "lawyers");
        RULES.put("garage|mecanique|automobile|vidange|ميكانيك", "car repair");
        RULES.put("supermarche|supermarches|hypermarche|épicerie|epicerie|سوبرماركت", "supermarkets");
        RULES.put("boulangerie|patisserie|boulangeries|pâtisserie|مخبزة", "bakeries");
        RULES.put("ecole|ecoles|formation|academie|مدرسة", "schools");
    }

    private NicheNormalizer() {}

    /** The English business type for a French or Arabic phrase, or the phrase unchanged when none is recognised. */
    public static String normalize(String niche) {
        if (niche == null) return null;
        String plain = Normalizer.normalize(niche.toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        for (Map.Entry<String, String> rule : RULES.entrySet()) {
            if (java.util.regex.Pattern.compile(rule.getKey()).matcher(plain).find()) return rule.getValue();
        }
        return niche;
    }
}
