'use client'

import { Component } from 'react'

export default class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { message: null | string }
> {
  state = { message: null }

  static getDerivedStateFromError(error: any) {
    return { message: error.message }
  }

  render() {
    return this.state.message !== null ? (
      <p id="error-message">{this.state.message}</p>
    ) : (
      this.props.children
    )
  }
}
