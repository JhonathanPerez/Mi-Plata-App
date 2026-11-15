package __PACKAGE__;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.Calendar;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Nombres de las copias de la nube y cuáles se conservan. Mismas reglas que src/lib/autoBackup.ts. */
final class BackupNames {

    private static final Pattern CLOUD = Pattern.compile("^MiPlata_nube_(\\d{4})-(\\d{2})-(\\d{2})\\.json$");

    private BackupNames() {}

    static String cloudFileName(String isoDate) {
        return "MiPlata_nube_" + isoDate + ".json";
    }

    /** La fecha (AAAA-MM-DD) de una copia de la nube según su nombre; null si el archivo no es una de nuestras copias. */
    static String dateOf(String name) {
        Matcher match = CLOUD.matcher(name);
        if (!match.matches()) return null;
        int month = Integer.parseInt(match.group(2));
        int day = Integer.parseInt(match.group(3));
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        return match.group(1) + "-" + match.group(2) + "-" + match.group(3);
    }

    /** Cuáles borrar para conservar solo las `keep` más recientes. Ignora todo lo que no sea una copia nuestra. */
    static List<String> toPrune(List<String> names, int keep) {
        List<String> ours = new ArrayList<>();
        for (String name : names) {
            if (dateOf(name) != null) ours.add(name);
        }
        Collections.sort(ours, new Comparator<String>() {
            @Override
            public int compare(String a, String b) {
                return dateOf(b).compareTo(dateOf(a));
            }
        });
        return ours.size() <= keep ? new ArrayList<String>() : new ArrayList<>(ours.subList(Math.max(0, keep), ours.size()));
    }

    /** La fecha de calendario local, como AAAA-MM-DD. */
    static String isoDate(long millis, TimeZone zone) {
        Calendar calendar = Calendar.getInstance(zone);
        calendar.setTimeInMillis(millis);
        return String.format(Locale.US, "%04d-%02d-%02d", calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH) + 1, calendar.get(Calendar.DAY_OF_MONTH));
    }
}
