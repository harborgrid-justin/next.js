import { Form } from './form'

export default function Page() {
  return (
    <Form
      action={async () => {
        'use server'
        return 'result'
      }}
    />
  )
}
