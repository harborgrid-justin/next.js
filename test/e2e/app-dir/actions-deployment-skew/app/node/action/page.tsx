import { Button } from './button'

export default function Page() {
  return (
    <Button
      action={async () => {
        'use server'
        console.log('Action!')
      }}
    />
  )
}
