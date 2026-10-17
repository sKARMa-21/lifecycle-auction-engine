// Dashboard page shown after successful login
export default function Dashboard({ user, onLogout }: {
  user: { full_name: string; email: string; role: string }
  onLogout: () => void
}) {
  return (
    <div className="page-container">
      <header className="page-header">
        <h1>Lifecycle &amp; Auction Engine</h1>
        <button onClick={onLogout} className="logout-btn">Logout</button>
      </header>

      <main className="page-main">
        <div className="form-box">
          <h2>Welcome, {user.full_name}</h2>
          <p>LDAP ID: {user.email}</p>
          <p>Role: {user.role}</p>

          <hr />
          {user.role === 'admin' ? (
            <div>
              <p>Admin Actions:</p>
              <ul>
                <li>View reported bikes</li>
                <li>Verify cycle claims</li>
              </ul>
            </div>
          ) : (
            <div>
              <p>Student Actions:</p>
              <ul>
                <li>Report an abandoned cycle</li>
                <li>Claim your cycle</li>
                <li>View auctions</li>
              </ul>
            </div>
          )}
        </div>
      </main>

      <footer className="page-footer">
        <p>CS699 - Lifecycle &amp; Auction Engine</p>
      </footer>
    </div>
  )
}
