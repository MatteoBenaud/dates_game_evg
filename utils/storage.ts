import { supabase } from '@/lib/supabase'

/**
 * Get public URL for an avatar from Storage
 * Returns null if no path provided (fallback to default avatar)
 */
export function getAvatarUrl(storagePath: string | null): string | null {
  if (!storagePath) return null

  const { data } = supabase.storage
    .from('avatars')
    .getPublicUrl(storagePath)

  return data.publicUrl
}

/**
 * Get avatar URL with backward compatibility
 * Tries storage path first, falls back to legacy avatar_url
 */
export function getPlayerAvatarUrl(player: {
  avatar_storage_path?: string | null
  avatar_url?: string | null
}): string | null {
  return getAvatarUrl(player.avatar_storage_path || null) || player.avatar_url || null
}

/**
 * Get public URL for a question image from Storage
 * Returns null if no path provided
 */
export function getQuestionImageUrl(storagePath: string | null): string | null {
  if (!storagePath) return null

  const { data } = supabase.storage
    .from('question-images')
    .getPublicUrl(storagePath)

  return data.publicUrl
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  return response.blob()
}

/**
 * Upload avatar to Storage and return the path
 */
export async function uploadAvatar(
  gameId: string,
  playerName: string,
  blob: Blob
): Promise<string | null> {
  try {
    const timestamp = Date.now()
    const fileName = `${gameId}/${playerName}_${timestamp}.jpg`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: true
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return null
    }

    console.log('✅ Avatar uploaded to Storage:', fileName)
    return fileName
  } catch (error) {
    console.error('Error uploading avatar:', error)
    return null
  }
}

/**
 * Upload question image to Storage and return the path
 */
export async function uploadQuestionImage(
  gameId: string,
  questionNumber: number,
  blob: Blob
): Promise<string | null> {
  try {
    const timestamp = Date.now()
    const fileName = `${gameId}/question_${questionNumber}_${timestamp}.jpg`

    const { error: uploadError } = await supabase.storage
      .from('question-images')
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: true
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return null
    }

    console.log('✅ Question image uploaded to Storage:', fileName)
    return fileName
  } catch (error) {
    console.error('Error uploading question image:', error)
    return null
  }
}
