package __PACKAGE__;

import androidx.core.content.FileProvider;

/**
 * FileProvider propio de las actualizaciones (autoridad «.updates», ver {@code res/xml/update_paths.xml}).
 *
 * Tiene que ser una subclase y no {@code androidx.core.content.FileProvider} directamente: Android identifica los
 * providers por el nombre de su clase, y Capacitor ya declara uno con ese nombre para su propia autoridad
 * («.fileprovider»). Con el mismo nombre, las peticiones a «.updates» las atendía el de Capacitor, que no conoce la
 * carpeta {@code updates/}, y el instalador de Android respondía «There was a problem parsing the package».
 */
public class UpdateFileProvider extends FileProvider {
}
