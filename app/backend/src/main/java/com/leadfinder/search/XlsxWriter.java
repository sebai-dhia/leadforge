package com.leadfinder.search;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * A one-sheet .xlsx file with a styled header, a frozen first row, filters, column widths and real links.
 * Text is stored as text (never as a formula), so a lead name that looks like a formula stays harmless.
 */
final class XlsxWriter {
    /** How a column looks: plain, wrapped text, a date or a centred number. */
    static final int PLAIN = 0, WRAP = 2, DATE = 3, CENTER = 5;
    private static final int HEADER = 1, LINK = 4;
    private static final int MAX_CELL = 32_000;

    record Column(String header, double width, int style) {}

    /** A cell that opens a web address; anything that is not http or https is written as plain text. */
    record Link(String text, String url) {}

    private final String sheetName;
    private final List<Column> columns;
    private final List<Object[]> rows = new ArrayList<>();

    XlsxWriter(String sheetName, List<Column> columns) {
        this.sheetName = sheetName;
        this.columns = columns;
    }

    /** A cell is a String, a Number, an Instant, a Link or null. */
    void addRow(Object... cells) {
        rows.add(cells);
    }

    byte[] toBytes() {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream(); ZipOutputStream zip = new ZipOutputStream(out)) {
            List<String> links = new ArrayList<>();
            String sheet = sheetXml(links);
            put(zip, "[Content_Types].xml", CONTENT_TYPES);
            put(zip, "_rels/.rels", ROOT_RELS);
            put(zip, "xl/workbook.xml", workbookXml());
            put(zip, "xl/_rels/workbook.xml.rels", WORKBOOK_RELS);
            put(zip, "xl/styles.xml", STYLES);
            put(zip, "xl/worksheets/sheet1.xml", sheet);
            if (!links.isEmpty()) put(zip, "xl/worksheets/_rels/sheet1.xml.rels", sheetRels(links));
            zip.finish();
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private String sheetXml(List<String> links) {
        StringBuilder s = new StringBuilder(XML).append("<worksheet xmlns=\"").append(NS).append("\" xmlns:r=\"").append(REL_NS).append("\">");
        s.append("<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews>");
        s.append("<sheetFormatPr defaultRowHeight=\"15\"/><cols>");
        for (int i = 0; i < columns.size(); i++) {
            s.append("<col min=\"").append(i + 1).append("\" max=\"").append(i + 1).append("\" width=\"").append(columns.get(i).width()).append("\" customWidth=\"1\"/>");
        }
        s.append("</cols><sheetData><row r=\"1\" ht=\"30\" customHeight=\"1\">");
        for (int c = 0; c < columns.size(); c++) text(s, ref(c, 1), columns.get(c).header(), HEADER);
        s.append("</row>");
        List<String> linkRefs = new ArrayList<>();
        for (int r = 0; r < rows.size(); r++) {
            int rowNo = r + 2;
            s.append("<row r=\"").append(rowNo).append("\">");
            Object[] cells = rows.get(r);
            for (int c = 0; c < columns.size() && c < cells.length; c++) {
                Object v = cells[c];
                String ref = ref(c, rowNo);
                int style = columns.get(c).style();
                if (v instanceof Link l && isWebAddress(l.url())) {
                    text(s, ref, l.text(), LINK);
                    linkRefs.add(ref);
                    links.add(l.url());
                } else if (v instanceof Link l) {
                    text(s, ref, l.text(), style);
                } else if (v instanceof Instant t) {
                    s.append("<c r=\"").append(ref).append("\" s=\"").append(DATE).append("\"><v>").append(serial(t)).append("</v></c>");
                } else if (v instanceof Number n) {
                    s.append("<c r=\"").append(ref).append("\" s=\"").append(style).append("\"><v>").append(n).append("</v></c>");
                } else if (v != null && !v.toString().isEmpty()) {
                    text(s, ref, v.toString(), style);
                }
            }
            s.append("</row>");
        }
        s.append("</sheetData>");
        s.append("<autoFilter ref=\"A1:").append(ref(columns.size() - 1, Math.max(1, rows.size() + 1))).append("\"/>");
        if (!linkRefs.isEmpty()) {
            s.append("<hyperlinks>");
            for (int i = 0; i < linkRefs.size(); i++) {
                s.append("<hyperlink ref=\"").append(linkRefs.get(i)).append("\" r:id=\"rId").append(i + 1).append("\"/>");
            }
            s.append("</hyperlinks>");
        }
        return s.append("</worksheet>").toString();
    }

    private static void text(StringBuilder s, String ref, String value, int style) {
        String v = value.length() > MAX_CELL ? value.substring(0, MAX_CELL) : value;
        s.append("<c r=\"").append(ref).append("\" s=\"").append(style).append("\" t=\"inlineStr\"><is><t xml:space=\"preserve\">")
                .append(escape(v)).append("</t></is></c>");
    }

    private String workbookXml() {
        return XML + "<workbook xmlns=\"" + NS + "\" xmlns:r=\"" + REL_NS + "\"><sheets><sheet name=\"" + escape(sheetName)
                + "\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>";
    }

    private static String sheetRels(List<String> urls) {
        StringBuilder s = new StringBuilder(XML).append("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">");
        for (int i = 0; i < urls.size(); i++) {
            s.append("<Relationship Id=\"rId").append(i + 1).append("\" Type=\"").append(REL_NS).append("/hyperlink\" Target=\"")
                    .append(escape(urls.get(i))).append("\" TargetMode=\"External\"/>");
        }
        return s.append("</Relationships>").toString();
    }

    static boolean isWebAddress(String url) {
        if (url == null) return false;
        String u = url.toLowerCase();
        return (u.startsWith("http://") || u.startsWith("https://")) && url.length() < 2000;
    }

    /** Excel stores a date as the number of days since 1899-12-30; the fraction is the time of day. */
    static double serial(Instant t) {
        return t.getEpochSecond() / 86_400.0 + 25_569.0;
    }

    static String ref(int col, int row) {
        StringBuilder letters = new StringBuilder();
        for (int c = col + 1; c > 0; c = (c - 1) / 26) letters.insert(0, (char) ('A' + (c - 1) % 26));
        return letters.toString() + row;
    }

    /** Escapes the XML characters and drops the control characters XML cannot hold. */
    static String escape(String v) {
        StringBuilder b = new StringBuilder(v.length() + 16);
        for (int i = 0; i < v.length(); i++) {
            char ch = v.charAt(i);
            switch (ch) {
                case '&' -> b.append("&amp;");
                case '<' -> b.append("&lt;");
                case '>' -> b.append("&gt;");
                case '"' -> b.append("&quot;");
                case '\'' -> b.append("&apos;");
                default -> {
                    boolean ok = ch == '\t' || ch == '\n' || ch == '\r' || (ch >= 0x20 && ch != 0xFFFE && ch != 0xFFFF);
                    if (ok) b.append(ch);
                }
            }
        }
        return b.toString();
    }

    private static void put(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static final String XML = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n";
    private static final String NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private static final String REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

    private static final String CONTENT_TYPES = XML
            + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
            + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
            + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
            + "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>"
            + "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"
            + "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>"
            + "</Types>";

    private static final String ROOT_RELS = XML
            + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
            + "<Relationship Id=\"rId1\" Type=\"" + REL_NS + "/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>";

    private static final String WORKBOOK_RELS = XML
            + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
            + "<Relationship Id=\"rId1\" Type=\"" + REL_NS + "/worksheet\" Target=\"worksheets/sheet1.xml\"/>"
            + "<Relationship Id=\"rId2\" Type=\"" + REL_NS + "/styles\" Target=\"styles.xml\"/></Relationships>";

    /** 0 plain, 1 header, 2 wrapped text, 3 date and time, 4 link, 5 centred. */
    private static final String STYLES = XML + "<styleSheet xmlns=\"" + NS + "\">"
            + "<numFmts count=\"1\"><numFmt numFmtId=\"164\" formatCode=\"yyyy\\-mm\\-dd\\ hh:mm\"/></numFmts>"
            + "<fonts count=\"3\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font>"
            + "<font><b/><sz val=\"11\"/><color rgb=\"FFFFFFFF\"/><name val=\"Calibri\"/></font>"
            + "<font><u/><sz val=\"11\"/><color rgb=\"FF0563C1\"/><name val=\"Calibri\"/></font></fonts>"
            + "<fills count=\"3\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill>"
            + "<fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF1F3D33\"/><bgColor indexed=\"64\"/></patternFill></fill></fills>"
            + "<borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders>"
            + "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>"
            + "<cellXfs count=\"6\">"
            + "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyAlignment=\"1\"><alignment vertical=\"top\"/></xf>"
            + "<xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"0\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyAlignment=\"1\"><alignment vertical=\"center\" wrapText=\"1\"/></xf>"
            + "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyAlignment=\"1\"><alignment vertical=\"top\" wrapText=\"1\"/></xf>"
            + "<xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyNumberFormat=\"1\" applyAlignment=\"1\"><alignment horizontal=\"left\" vertical=\"top\"/></xf>"
            + "<xf numFmtId=\"0\" fontId=\"2\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyFont=\"1\" applyAlignment=\"1\"><alignment vertical=\"top\"/></xf>"
            + "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyAlignment=\"1\"><alignment horizontal=\"center\" vertical=\"top\"/></xf>"
            + "</cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>";
}
