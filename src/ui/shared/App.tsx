/**
 * Ruteo de superficies. T066.
 *
 * Un único despliegue sirve a las dos. `/presentador` muestra el acceso del presentador;
 * cualquier otra ruta, la del participante. La ruta solo elige qué pantalla pintar: lo que
 * cada quien **puede hacer** lo deciden la autenticación y las reglas, no la URL.
 */
import { PlayerApp } from '../player/PlayerApp';
import { PresenterApp } from '../presenter/PresenterApp';

export function isPresenterPath(pathname: string): boolean {
  return /^\/presentador\/?$/.test(pathname);
}

export function App() {
  return isPresenterPath(window.location.pathname) ? <PresenterApp /> : <PlayerApp />;
}
