export default function BrandLogo() {
  return (
    <span className="nav-brand">
      <img src={`${import.meta.env.BASE_URL}favicon.svg?v=arrows`} alt="" width="42" height="42" />
      <span>Cycle<span className="brand-accent">Engine</span></span>
    </span>
  )
}
