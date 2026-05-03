import React from 'react';

export class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-slate-50 p-8">
          <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-red-100 text-center">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Something went wrong</h2>
            <p className="text-slate-600 mb-6">We encountered an unexpected error. Please try refreshing the page.</p>
            <pre className="text-left bg-slate-50 p-4 rounded-lg text-xs text-red-600 overflow-auto mb-6 max-h-40">
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <button 
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
