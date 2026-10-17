package com.leadfinder.search;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class NicheNormalizerTest {

    @Test
    void frenchBusinessTypesMapToTheEnglishOnes() {
        assertEquals("dental clinics", NicheNormalizer.normalize("cabinets dentaires"));
        assertEquals("hair salons", NicheNormalizer.normalize("Salons de coiffure"));
        assertEquals("lawyers", NicheNormalizer.normalize("cabinets d'avocats"));
        assertEquals("bakeries", NicheNormalizer.normalize("Boulangeries"));
        assertEquals("cafes", NicheNormalizer.normalize("cafés"));
        assertEquals("hotels", NicheNormalizer.normalize("hôtels"));
        assertEquals("gyms", NicheNormalizer.normalize("salles de sport"));
        assertEquals("car repair", NicheNormalizer.normalize("garages automobiles"));
        assertEquals("beauty salons", NicheNormalizer.normalize("instituts de beauté"));
    }

    @Test
    void arabicWordsAreRecognisedToo() {
        assertEquals("pharmacies", NicheNormalizer.normalize("صيدلية"));
        assertEquals("lawyers", NicheNormalizer.normalize("محامي"));
    }

    @Test
    void englishAndUnknownTermsPassThroughUnchanged() {
        assertEquals("dental clinics", NicheNormalizer.normalize("dental clinics"));
        assertEquals("tattoo studios", NicheNormalizer.normalize("tattoo studios"));
        assertNull(NicheNormalizer.normalize(null));
    }
}
