import logoBlanco from '../assets/logo largo blanco sin fondo.svg'
import logoNegro from '../assets/logo largo negro sin fondo.svg'

// Logo que cambia con el tema: blanco (letras blancas) en oscuro, negro en claro.
// El cambio lo hace el CSS (.logo-dark / .logo-light) según [data-theme].
// No pasar `display` en style — lo controla el CSS.
export default function Logo({ style, alt = 'Caballer' }) {
  return (
    <>
      <img src={logoBlanco} alt={alt} className="logo-swap logo-dark" style={style} />
      <img src={logoNegro}  alt={alt} className="logo-swap logo-light" style={style} />
    </>
  )
}
