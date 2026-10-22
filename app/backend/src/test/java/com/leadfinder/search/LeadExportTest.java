package com.leadfinder.search;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Lead names and addresses come from public data, so the Excel file must be valid and safe to open. */
class LeadExportTest {

    private static Lead lead(String name, String city) {
        Lead l = new Lead();
        l.setName(name);
        l.setNiche("dental clinics");
        l.setCity(city);
        l.setScore(8);
        l.setStatus("NEW");
        return l;
    }

    private static Map<String, String> unzip(byte[] xlsx) throws IOException {
        Map<String, String> files = new HashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(xlsx))) {
            for (ZipEntry e; (e = zip.getNextEntry()) != null; ) files.put(e.getName(), new String(zip.readAllBytes(), StandardCharsets.UTF_8));
        }
        return files;
    }

    @Test
    void theFileHasTheStructureExcelNeeds() throws IOException {
        Map<String, String> f = unzip(LeadExport.build(List.of(lead("Cabinet A", "Sousse")), "en"));
        for (String part : List.of("[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml")) {
            assertTrue(f.containsKey(part), part);
        }
        String sheet = f.get("xl/worksheets/sheet1.xml");
        assertTrue(sheet.contains("state=\"frozen\""), "the header row stays in view");
        assertTrue(sheet.contains("<autoFilter ref=\"A1:S2\"/>"), "filters on every column");
        assertTrue(sheet.contains(">Cabinet A<"));
        assertTrue(sheet.contains(">New<"), "a readable status, not NEW");
    }

    @Test
    void textThatLooksLikeAFormulaStaysText() throws IOException {
        String sheet = unzip(LeadExport.build(List.of(lead("=HYPERLINK(\"http://evil.example\")", "@SUM(1)")), "en")).get("xl/worksheets/sheet1.xml");
        assertFalse(sheet.contains("<f>"));
        assertTrue(sheet.contains("t=\"inlineStr\""));
        assertTrue(sheet.contains(">=HYPERLINK(&quot;http://evil.example&quot;)<"), "kept as it is, with no quote added in front");
    }

    @Test
    void xmlCharactersAreEscapedAndControlCharactersDropped() {
        assertEquals("a &amp; b &lt;c&gt; &quot;d&quot;", XlsxWriter.escape("a & b <c> \"d\""));
        assertEquals("ab", XlsxWriter.escape("a\u0000b"));
        assertEquals("a\nb", XlsxWriter.escape("a\nb"));
    }

    @Test
    void onlyWebAddressesBecomeLinks() throws IOException {
        Lead l = lead("Cabinet A", "Sousse");
        l.setWebsite("javascript:alert(1)");
        l.setPlaceId("ChIJ abc");
        Map<String, String> f = unzip(LeadExport.build(List.of(l), "en"));
        String rels = f.get("xl/worksheets/_rels/sheet1.xml.rels");
        assertTrue(rels.contains("https://www.google.com/maps/place/?q=place_id:ChIJ+abc"), "the Maps link");
        assertFalse(rels.contains("javascript:"), "a script address is shown as text, never linked");
        assertTrue(f.get("xl/worksheets/sheet1.xml").contains(">javascript:alert(1)<"));
    }

    @Test
    void aDrawnAreaShowsAPlaceNotCoordinates() throws IOException {
        String sheet = unzip(LeadExport.build(List.of(lead("A", "Map Area: Tunis [10.0596,36.7416,10.3144,36.8648]"), lead("B", "Map Area [10,36,10.3,36.8]")), "en"))
                .get("xl/worksheets/sheet1.xml");
        assertTrue(sheet.contains(">Tunis (drawn area)<"));
        assertTrue(sheet.contains(">Drawn map area<"));
        assertFalse(sheet.contains("10.0596"));
    }

    @Test
    void datesAreRealDatesAndNumbersAreNumbers() throws IOException {
        Lead l = lead("A", "Tunis");
        l.setFirstSeenAt(Instant.parse("2026-10-19T12:00:00Z"));
        String sheet = unzip(LeadExport.build(List.of(l), "en")).get("xl/worksheets/sheet1.xml");
        assertTrue(sheet.contains("<v>" + XlsxWriter.serial(Instant.parse("2026-10-19T12:00:00Z")) + "</v>"));
        assertEquals(46314.5, XlsxWriter.serial(Instant.parse("2026-10-19T12:00:00Z")), 0.0001);
        assertTrue(sheet.contains("<v>8</v>"), "the score is a number");
    }

    @Test
    void columnLettersGoPastZ() {
        assertEquals("A1", XlsxWriter.ref(0, 1));
        assertEquals("S7", XlsxWriter.ref(18, 7));
        assertEquals("AA2", XlsxWriter.ref(26, 2));
    }

    @Test
    void theFileNameSaysWhatIsInsideAndIsPlainAscii() {
        List<Lead> sousse = List.of(lead("A", "Sousse"), lead("B", "Sousse"));
        assertEquals("2026-10-21-leadforge-dental-clinics-sousse.xlsx", LeadExport.fileName(sousse, LocalDate.of(2026, 10, 21)));
        assertEquals("2026-10-21-leadforge-dental-clinics.xlsx",
                LeadExport.fileName(List.of(lead("A", "Sousse"), lead("B", "Tunis")), LocalDate.of(2026, 10, 21)));
        assertEquals("2026-10-21-leadforge-leads.xlsx", LeadExport.fileName(List.of(), LocalDate.of(2026, 10, 21)));
        assertEquals("cafe-creme", LeadExport.slug("Café  Crème!"));
        assertEquals("leads", LeadExport.slug("عيادة"));
    }

    @Test
    void frenchReadsInFrench() throws IOException {
        Lead l = lead("A", "Tunis");
        l.setDraftLanguage("ar");
        l.setDraftChannel("whatsapp");
        String sheet = unzip(LeadExport.build(List.of(l), "fr")).get("xl/worksheets/sheet1.xml");
        assertTrue(sheet.contains(">Téléphone<") && sheet.contains(">Nouveau<") && sheet.contains(">Arabe<") && sheet.contains(">WhatsApp<"));
    }
}
