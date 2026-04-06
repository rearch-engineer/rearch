import React from 'react';

const styles = `
  .error-boundary-root {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
    min-height: 100vh;
    gap: 16px;
    padding: 32px;
    text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background-color: #fff;
    color: #111;
    box-sizing: border-box;
  }
  .error-boundary-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }
  .error-boundary-message {
    margin: 0;
    font-size: 0.875rem;
    color: #555;
    max-width: 480px;
  }
  .error-boundary-actions {
    display: flex;
    gap: 8px;
  }
  .error-boundary-btn {
    padding: 8px 16px;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    font-size: 0.875rem;
    color: inherit;
  }
  @media (prefers-color-scheme: dark) {
    .error-boundary-root {
      background-color: #111;
      color: #f0f0f0;
    }
    .error-boundary-message {
      color: #999;
    }
    .error-boundary-btn {
      border-color: #444;
      color: #f0f0f0;
    }
    .error-boundary-btn:hover {
      background-color: #222;
    }
  }
`;

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <>
          <style>{styles}</style>
          <div className="error-boundary-root">
            <h2 className="error-boundary-title">Something went wrong</h2>
            <p className="error-boundary-message">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <div className="error-boundary-actions">
              <button className="error-boundary-btn" onClick={this.handleReset}>
                Try again
              </button>
              <button className="error-boundary-btn" onClick={() => window.location.reload()}>
                Reload page
              </button>
            </div>
          </div>
        </>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
